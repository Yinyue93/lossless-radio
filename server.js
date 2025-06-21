const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');

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
        this.clients = new Set();
    }

    addClient(res) {
        this.clients.add(res);
        console.log(`Client connected. Total clients: ${this.clients.size}`);
        res.on('close', () => {
            this.clients.delete(res);
            console.log(`Client disconnected. Total clients: ${this.clients.size}`);
        });
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
        // In a real app, you might want more complex logic here,
        // but for now we'll just swap the playlist.
        // This won't interrupt the currently playing song.
        this.playlist = newOrder;
        console.log('Playlist order updated:', this.playlist);
    }
    
    start() {
        if (this.isBroadcasting) {
            return;
        }
        this.isBroadcasting = true;
        this.refreshPlaylist().then(() => this._streamNextFile());
    }

    _streamNextFile() {
        if (this.playlist.length === 0) {
            console.log("Playlist is empty. Waiting 5 seconds to retry.");
            setTimeout(() => this._streamNextFile(), 5000);
            return;
        }

        if (this.currentFileIndex >= this.playlist.length) {
            this.currentFileIndex = 0; // Loop playlist
        }

        const fileName = this.playlist[this.currentFileIndex];
        const filePath = path.join(uploadsDir, fileName);

        if (!fs.existsSync(filePath)) {
            console.error(`File not found: ${filePath}, skipping.`);
            this.currentFileIndex++;
            this._streamNextFile();
            return;
        }

        console.log(`Broadcasting: ${fileName}`);
        const stream = fs.createReadStream(filePath);

        stream.on('data', (chunk) => {
            for (const client of this.clients) {
                client.write(chunk);
            }
        });

        stream.on('end', () => {
            console.log(`Finished broadcasting: ${fileName}`);
            this.currentFileIndex++;
            this._streamNextFile();
        });

        stream.on('error', (err) => {
            console.error('Stream error:', err);
            this.currentFileIndex++;
            this._streamNextFile();
        });
    }
}

const radio = new RadioBroadcaster();
radio.start();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

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