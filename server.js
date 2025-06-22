// ✅ UPDATED SERVER.JS to fix memory leak using PassThrough stream and stream from live point

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');

const app = express();
const port = 3000;

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

class RadioBroadcaster extends EventEmitter {
    constructor() {
        super();
        this.playlist = [];
        this.currentFileIndex = 0;
        this.isBroadcasting = false;
        this.clients = new Map();

        this.masterStream = null;
        this.sharedStream = null;
        this.currentFileName = null;
        this.broadcastStartTime = null;
        this.currentFileStartTime = null;
        this.isLooping = false;
        this.byteOffset = 0; // NEW: Track how many bytes have been streamed
    }

    addClient(res) {
        const clientInfo = {
            response: res,
            currentStream: null,
            id: Date.now() + Math.random()
        };

        this.clients.set(res, clientInfo);
        console.log(`Client connected (ID: ${clientInfo.id}). Total clients: ${this.clients.size}`);

        res.on('close', () => {
            console.log(`Client disconnected (ID: ${clientInfo.id})`);
            const client = this.clients.get(res);
            if (client && client.currentStream) {
                client.currentStream.destroy();
            }
            this.clients.delete(res);
        });

        res.on('error', (err) => {
            console.error(`Client error (ID: ${clientInfo.id}):`, err);
            const client = this.clients.get(res);
            if (client && client.currentStream) {
                client.currentStream.destroy();
            }
            this.clients.delete(res);
        });

        this._streamForClient(clientInfo);
    }

    async refreshPlaylist() {
        try {
            const files = await fs.promises.readdir(uploadsDir);
            this.playlist = files.filter(file => path.extname(file).toLowerCase() === '.flac');
            console.log('Playlist refreshed:', this.playlist);
        } catch (error) {
            console.error('Error refreshing playlist:', error);
            this.playlist = [];
        }
    }

    updatePlaylistOrder(newOrder) {
        this.playlist = newOrder;
        console.log('Playlist order updated:', this.playlist);
    }

    start() {
        if (this.isBroadcasting) return;
        this.isBroadcasting = true;
        this.refreshPlaylist().then(() => this._startGlobalBroadcast());
    }

    _startGlobalBroadcast() {
        if (this.playlist.length === 0) {
            console.log("Playlist is empty. Waiting 5 seconds to retry.");
            setTimeout(() => this._startGlobalBroadcast(), 5000);
            return;
        }

        if (this.currentFileIndex >= this.playlist.length) {
            this.currentFileIndex = 0;
        }

        const fileName = this.playlist[this.currentFileIndex];
        const filePath = path.join(uploadsDir, fileName);

        if (!fs.existsSync(filePath)) {
            console.error(`File not found: ${filePath}, skipping.`);
            this.currentFileIndex++;
            this._startGlobalBroadcast();
            return;
        }

        console.log(`Starting global broadcast: ${fileName}`);
        this.currentFileName = fileName;
        this.currentFileStartTime = Date.now();
        this.byteOffset = 0;

        if (this.masterStream) this.masterStream.destroy();
        if (this.sharedStream) this.sharedStream.destroy();

        this.masterStream = fs.createReadStream(filePath);
        this.sharedStream = new PassThrough();

        // Track byte offset
        this.masterStream.on('data', chunk => {
            this.byteOffset += chunk.length;
        });

        this.masterStream.pipe(this.sharedStream);

        this.masterStream.on('end', () => {
            console.log(`Global broadcast file ended: ${fileName}`);
            this.currentFileIndex++;
            this._startGlobalBroadcast();
        });

        this.masterStream.on('error', (err) => {
            console.error('Global broadcast stream error:', err);
            this.currentFileIndex++;
            this._startGlobalBroadcast();
        });
    }

    _streamForClient(clientInfo) {
        if (!this.clients.has(clientInfo.response)) return;

        const filePath = path.join(uploadsDir, this.currentFileName || '');

        if (!fs.existsSync(filePath)) {
            console.log("No current file to stream, retrying...");
            setTimeout(() => {
                if (this.clients.has(clientInfo.response)) {
                    this._streamForClient(clientInfo);
                }
            }, 1000);
            return;
        }

        const stream = fs.createReadStream(filePath, { start: this.byteOffset });
        clientInfo.currentStream = stream;

        stream.pipe(clientInfo.response);

        stream.on('error', err => {
            console.error(`Client stream error (ID: ${clientInfo.id}):`, err);
            this.clients.delete(clientInfo.response);
        });

        stream.on('close', () => {
            if (clientInfo.currentStream === stream) {
                clientInfo.currentStream = null;
            }
            this.clients.delete(clientInfo.response);
        });
    }

    cleanup() {
        console.log('Forcing cleanup of all client streams');
        if (this.masterStream) this.masterStream.destroy();
        if (this.sharedStream) this.sharedStream.destroy();
        this.masterStream = null;
        this.sharedStream = null;

        for (const [res, clientInfo] of this.clients.entries()) {
            if (clientInfo.currentStream) {
                clientInfo.currentStream.destroy();
                clientInfo.currentStream = null;
            }
        }
    }
}

const radio = new RadioBroadcaster();
radio.start();

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

app.use(express.static('public'));
app.use(express.json());

app.get('/api/playlist', async (req, res) => {
    await radio.refreshPlaylist();
    res.json(radio.playlist);
});

app.post('/api/upload', upload.array('flacFiles'), async (req, res) => {
    await radio.refreshPlaylist();
    res.json({ message: 'Files uploaded successfully!' });
});

app.post('/api/playlist/order', (req, res) => {
    const { newOrder } = req.body;
    if (!newOrder || !Array.isArray(newOrder)) {
        return res.status(400).send('Invalid playlist order data');
    }
    radio.updatePlaylistOrder(newOrder);
    res.json({ message: 'Playlist order updated' });
});

app.get('/stream', (req, res) => {
    res.setHeader('Content-Type', 'audio/flac');
    radio.addClient(res);
});

app.listen(port, () => {
    console.log(`Lossless Radio listening at http://localhost:${port}`);
});
