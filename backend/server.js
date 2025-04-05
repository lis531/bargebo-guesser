import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import admin from 'firebase-admin';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const serviceAccount = {
    type: process.env.FIREBASE_TYPE,
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
    universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN
};

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "bargebo-27328.firebasestorage.app"
});

const bucket = admin.storage().bucket();

const NUM_SONGS_TO_GUESS = 4;

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 2137;

app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
        return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
});

let numberOfDownloads = 0;

function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
}

async function downloadFirebase(videoUrl) {
    try {
        const videoID = videoUrl.split('watch?v=')[1];
        const file = bucket.file(`songs/${videoID}.mp3`);
        const [exists] = await file.exists();

        if (exists) {
            const [url] = await file.getSignedUrl({
                action: 'read',
                expires: '03-09-2030'
            });
            console.log(`${url} already exists in Firebase Storage.`);

            const stream = file.createReadStream();
            const buffer = await streamToBuffer(stream);
            const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
            return arrayBuffer;
        } else {
            console.log("Song does not exist in Firebase Storage.");
            return null;
        }
    } catch (err) {
        console.error(`Error downloading from Firebase: ${err.message}`);
        return null;
    }
}

const lobbies = {};

const allSongs = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'db.json'), 'utf8'));
for (let i = 0; i < allSongs.length; i++) {
    allSongs[i].cover = `https://img.youtube.com/vi/${allSongs[i].id}/0.jpg`;
    allSongs[i].url = `https://www.youtube.com/watch?v=${allSongs[i].id}`;
    delete allSongs[i].id;
}

console.log("Loaded the songs DB of " + allSongs.length + " songs.");
console.log("Downloaded " + numberOfDownloads + " songs.");

async function announceRoundStart(lobbyName) {
    if (!lobbies[lobbyName]) return;

    lobbies[lobbyName].players.forEach(player => player.choice = -1);
    lobbies[lobbyName].roundStarted = true;
    lobbies[lobbyName].currentRound += 1;
    lobbies[lobbyName].firstAnswerPlayerId = '';

    console.log("Selecting tracks...");
    const selectedTracks = [];
    for (let i = 0; i < NUM_SONGS_TO_GUESS; i++) {
        const randomIndex = Math.floor(Math.random() * allSongs.length);
        selectedTracks.push(allSongs[randomIndex]);
    }

    console.log(selectedTracks);

    const correctIndex = Math.floor(Math.random() * selectedTracks.length);
    const correctVideoUrl = selectedTracks[correctIndex].url;
    lobbies[lobbyName].correctIndex = correctIndex;

    console.log("Fetching song from Firebase...");

    let correctSongData = await downloadFirebase(correctVideoUrl);
    if (!correctSongData) {
        const url = await uploadFirebase(correctVideoUrl);
        if (url) {
            correctSongData = await downloadFirebase(correctVideoUrl);
        }
    }
    console.log("Starting round...");

    io.to(lobbyName).emit('onRoundStart', selectedTracks, correctIndex, correctSongData, lobbies[lobbyName].currentRound, lobbies[lobbyName].rounds);

    lobbies[lobbyName].timePassed = 0;

    const timerInterval = setInterval(() => {
        if (!lobbies[lobbyName]) {
            clearInterval(timerInterval);
            return;
        }

        lobbies[lobbyName].timePassed += 0.01;
        io.to(lobbyName).emit('timerChange', lobbies[lobbyName].timePassed.toFixed(2));

        if (lobbies[lobbyName].timePassed >= 20) {
            announceRoundEnd(lobbyName);
        }
    }, 10);

    lobbies[lobbyName].timerInterval = timerInterval;
}

async function announceRoundEnd(lobbyName) {
    if (!lobbies[lobbyName]) {
        return;
    }

    clearTimeout(lobbies[lobbyName].answerTimeout);
    clearInterval(lobbies[lobbyName].timerInterval);
    
    lobbies[lobbyName].roundStarted = false;
    io.to(lobbyName).emit('onRoundEnd');

    if (lobbies[lobbyName].rounds - lobbies[lobbyName].currentRound > 0) {
        announceRoundStart(lobbyName);
    } else {
        console.log("Game ended.");
        io.to(lobbyName).emit('onGameEnd');
    }
}

io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    socket.emit('onLobbyListChanged', lobbies);

    socket.on('createLobby', async (lobbyName, username) => {
        if (lobbies[lobbyName]) {
            socket.emit('createLobbyResponse', lobbyName, 'Lobby already exists!');
            return;
        }

        lobbies[lobbyName] = {
            players: [{ id: socket.id, username: username, choice: -1, score: 0, isHost: true }],
            roundStarted: false,
            currentRound: 0,
            rounds: 0
        };
        socket.join(lobbyName);
        socket.emit('createLobbyResponse', lobbyName, '');
        io.emit('onLobbyListChanged', lobbies);
        io.to(lobbyName).emit('onPlayersChanged', lobbies[lobbyName].players.sort((a, b) => b.score - a.score));
        console.log(`Lobby created: ${lobbyName}, by: ${username}`);
    });

    socket.on('joinLobby', async (lobbyName, username) => {
        if (!lobbies[lobbyName]) {
            socket.emit('joinLobbyResponse', 'Lobby does not exist!');
            return;
        }

        for (const player of lobbies[lobbyName].players) {
            if (player.username === username) {
                socket.emit('joinLobbyResponse', 'Player with this name is in the lobby!');
                return;
            }
            if (player.id === socket.id) {
                socket.emit('joinLobbyResponse', 'This client is connected to the lobby!');
                return;
            }
        }

        lobbies[lobbyName].players.push({ id: socket.id, username: username, choice: -1, score: 0 });
        socket.join(lobbyName);
        socket.emit('joinLobbyResponse', '');
        io.to(lobbyName).emit('onPlayersChanged', lobbies[lobbyName].players.sort((a, b) => b.score - a.score));
        console.log(`User ${username} joined lobby: ${lobbyName}`);
    });

    socket.on('announceGameStart', async (lobbyName, rounds) => {
        if (!lobbies[lobbyName]) return;
        if (lobbies[lobbyName].players.id == socket.id && !lobbies[lobbyName].players.isHost) return;
        lobbies[lobbyName].rounds = rounds;
        lobbies[lobbyName].roundStarted = false;
        lobbies[lobbyName].currentRound = 0;
        lobbies[lobbyName].firstAnswserPlayerId = '';
        lobbies[lobbyName].timePassed = 0;
        lobbies[lobbyName].timerInterval = null;
        for (const player of lobbies[lobbyName].players) {
            player.score = 0;
            console.log(player.username + " score: " + player.score);
            player.choice = -1;
        }
        io.to(lobbyName).emit('onPlayersChanged', lobbies[lobbyName].players.sort((a, b) => b.score - a.score));
        io.to(lobbyName).emit('onGameStart');
    });

    socket.on('announceRoundStart', async (lobbyName) => {
        announceRoundStart(lobbyName);
    });

    socket.on('submitAnswer', async (lobbyName, choiceIndex) => {
        if (!lobbies[lobbyName] || lobbies[lobbyName].roundStarted === false) {
            console.log(`${socket.id} submitted answer too late or lobby doesn't exist.`);
            return;
        }

        for (const player of lobbies[lobbyName].players) {
            if (player.id === socket.id) {
                player.choice = choiceIndex;
                if (choiceIndex == lobbies[lobbyName].correctIndex) {
                    if (lobbies[lobbyName].firstAnswerPlayerId === '') {
                        lobbies[lobbyName].firstAnswerPlayerId = socket.id;
                        player.score += 50;
                    }
        
                    const maxScore = 500;
                    const minScore = 80;
                    const timeLimit = 20;
                    const timePassed = lobbies[lobbyName].timePassed;
        
                    if (timePassed <= 0.5) {
                        player.score += maxScore;
                    } else {
                        const timeFactor = Math.exp(-2 * (timePassed / timeLimit));
                        const score = minScore + (maxScore - minScore) * timeFactor;
                        player.score += Math.round(score);
                    }
                }
                io.to(lobbyName).emit('onPlayersChanged', lobbies[lobbyName].players.sort((a, b) => b.score - a.score));
                break;
            }
        }

        for (const player of lobbies[lobbyName].players) {
            if (player.choice === -1) {
                console.log("Not all players submitted their answers.");
                return;
            }
        }

        console.log("All players submitted their answers.");

        const answerTimeout = setTimeout(() => {
            announceRoundEnd(lobbyName);
        }, 5000);

        lobbies[lobbyName].answerTimeout = answerTimeout;
    });

    socket.on('disconnect', () => {
        for (const lobby in lobbies) {
            lobbies[lobby].players = lobbies[lobby].players.filter(p => p.id !== socket.id);
            console.log(`Client disconnected: ${socket.id}`);
            io.to(lobby).emit('onPlayersChanged', lobbies[lobby].players.sort((a, b) => b.score - a.score));
            if (lobbies[lobby].players.length === 0) {
                delete lobbies[lobby];
                io.emit('onLobbyListChanged', lobbies);
            }
        }
    });

    socket.on('leaveLobby', (lobbyName) => {
        if (!lobbies[lobbyName]) return;
        lobbies[lobbyName].players = lobbies[lobbyName].players.filter(p => p.id !== socket.id);
        socket.leave(lobbyName);
        io.to(lobbyName).emit('onPlayersChanged', lobbies[lobbyName].players.sort((a, b) => b.score - a.score));
        if (lobbies[lobbyName].players.length === 0) {
            delete lobbies[lobbyName];
            io.emit('onLobbyListChanged', lobbies);
        }
    });

});

server.listen(PORT, () => {
    console.log('Server running on port:' + PORT);
});