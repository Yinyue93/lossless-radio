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
        this.clients = new Map(); // Changed from Set to Map to track streams per client
        
        // Global broadcast state
        this.masterStream = null;
        this.currentFileName = null;
        this.broadcastStartTime = null;
        this.currentFileStartTime = null;
        this.isLooping = false;
    }

    addClient(res) {
        const clientInfo = {
            response: res,
            currentStream: null,
            id: Date.now() + Math.random() // Simple unique ID
        };
        
        this.clients.set(res, clientInfo);
        console.log(`Client connected (ID: ${clientInfo.id}). Total clients: ${this.clients.size}`);
        
        res.on('close', () => {
            // Clean up stream when client disconnects
            const client = this.clients.get(res);
            if (client && client.currentStream) {
                console.log(`Cleaning up stream for disconnected client (ID: ${client.id})`);
                client.currentStream.destroy();
            }
            this.clients.delete(res);
            console.log(`Client disconnected (ID: ${client.id}). Total clients: ${this.clients.size}`);
        });
        
        res.on('error', (err) => {
            console.error(`Client error (ID: ${clientInfo.id}):`, err);
            const client = this.clients.get(res);
            if (client && client.currentStream) {
                client.currentStream.destroy();
            }
            this.clients.delete(res);
        });
        
        // Start streaming for this client from current broadcast position
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
        this.refreshPlaylist().then(() => {
            this._startGlobalBroadcast();
        });
    }

    _startGlobalBroadcast() {
        if (this.playlist.length === 0) {
            console.log("Playlist is empty. Waiting 5 seconds to retry.");
            setTimeout(() => this._startGlobalBroadcast(), 5000);
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
            this._startGlobalBroadcast();
            return;
        }

        console.log(`Starting global broadcast: ${fileName}`);
        this.currentFileName = fileName;
        this.currentFileStartTime = Date.now();
        
        // Create master stream for the current file
        if (this.masterStream) {
            this.masterStream.destroy();
        }
        
        this.masterStream = fs.createReadStream(filePath);
        
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

        // Don't read the master stream data here - it's just for timing
        // Individual client streams will handle the actual data streaming
    }

    _streamForClient(clientInfo) {
        // Check if client is still connected
        if (!this.clients.has(clientInfo.response)) {
            console.log(`Client (ID: ${clientInfo.id}) no longer connected, stopping stream`);
            return;
        }

        if (this.playlist.length === 0 || !this.currentFileName) {
            console.log("No current broadcast. Waiting 2 seconds to retry.");
            setTimeout(() => {
                if (this.clients.has(clientInfo.response)) {
                    this._streamForClient(clientInfo);
                }
            }, 2000);
            return;
        }

        const filePath = path.join(uploadsDir, this.currentFileName);

        if (!fs.existsSync(filePath)) {
            console.error(`Current broadcast file not found: ${filePath}`);
            setTimeout(() => {
                if (this.clients.has(clientInfo.response)) {
                    this._streamForClient(clientInfo);
                }
            }, 2000);
            return;
        }

        // Clean up previous stream for this client
        if (clientInfo.currentStream) {
            console.log(`Cleaning up previous stream for client (ID: ${clientInfo.id})`);
            clientInfo.currentStream.destroy();
            clientInfo.currentStream = null;
        }

        // Calculate current position in the broadcast
        const currentTime = Date.now();
        const elapsedTime = currentTime - this.currentFileStartTime;
        
        // For simplicity, we'll estimate position based on time elapsed
        // This assumes a rough bitrate - you could get more precise with file analysis
        const estimatedBitrate = 1411200; // CD quality FLAC roughly 1.4 Mbps
        const estimatedBytesPerMs = estimatedBitrate / 8 / 1000;
        const estimatedStartByte = Math.floor(elapsedTime * estimatedBytesPerMs);

        console.log(`Starting stream for client (ID: ${clientInfo.id}) at estimated position: ${estimatedStartByte} bytes`);

        // Create stream starting from estimated current position
        const streamOptions = estimatedStartByte > 0 ? { start: estimatedStartByte } : {};
        const stream = fs.createReadStream(filePath, streamOptions);
        clientInfo.currentStream = stream;

        stream.on('data', (chunk) => {
            // Double-check client is still connected before writing
            if (this.clients.has(clientInfo.response)) {
                try {
                    clientInfo.response.write(chunk);
                } catch (err) {
                    console.error(`Error writing to client (ID: ${clientInfo.id}):`, err);
                    stream.destroy();
                    this.clients.delete(clientInfo.response);
                }
            } else {
                // Client disconnected, destroy stream
                stream.destroy();
            }
        });

        stream.on('end', () => {
            console.log(`Stream ended for client (ID: ${clientInfo.id}): ${this.currentFileName}`);
            clientInfo.currentStream = null;
            
            // Wait a moment then reconnect to next file
            setTimeout(() => {
                if (this.clients.has(clientInfo.response)) {
                    this._streamForClient(clientInfo);
                }
            }, 100);
        });

        stream.on('error', (err) => {
            console.error(`Stream error for client (ID: ${clientInfo.id}):`, err);
            clientInfo.currentStream = null;
            
            // Try to reconnect after error
            setTimeout(() => {
                if (this.clients.has(clientInfo.response)) {
                    this._streamForClient(clientInfo);
                }
            }, 1000);
        });

        // Handle stream cleanup on destroy
        stream.on('close', () => {
            console.log(`Stream closed for client (ID: ${clientInfo.id})`);
            if (clientInfo.currentStream === stream) {
                clientInfo.currentStream = null;
            }
        });
    }

    // Method to force cleanup of all streams (useful for debugging)
    cleanup() {
        console.log('Forcing cleanup of all client streams');
        if (this.masterStream) {
            this.masterStream.destroy();
            this.masterStream = null;
        }
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