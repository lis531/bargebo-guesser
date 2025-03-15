import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import ytSearch from 'yt-search';
import { exec } from 'child_process';
import fs from 'fs';

import admin from 'firebase-admin';
import dotenv from 'dotenv';

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

const LAST_FM_API_KEY = process.env.LAST_FM_API_KEY;

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "bargebo-27328.firebasestorage.app"
});

const bucket = admin.storage().bucket();

const NUM_SONGS_TO_GUESS = 4;

const app = express();

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

async function fetchTracks() {
    const limit = 50;
    const totalPages = 20;
    let allTracks = [];

    for (let page = 1; page <= totalPages; page++) {
        const url = `http://ws.audioscrobbler.com/2.0/?method=chart.gettoptracks&api_key=${LAST_FM_API_KEY}&format=json&limit=${limit}&page=${page}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.tracks && data.tracks.track) {
            allTracks.push(...data.tracks.track);
        }
    }

    console.log(`Fetched ${allTracks.length} tracks from Last.fm`);

    const songs = allTracks.map(track => ({
        title: track.name,
        artist: track.artist.name,
        id: ''
    }));

    return songs;
}

async function updateSongDB() {
    let allSongs = await fetchTracks();

    const BLOCK_SIZE = 100;
    for (let blockID = 0; blockID < Math.ceil(allSongs.length / BLOCK_SIZE); blockID++) {
        console.log("Starting block " + blockID + " at i=" + (blockID * BLOCK_SIZE));

        const promises = [];
        for (let i = blockID * BLOCK_SIZE, j = 0; i < allSongs.length && j < BLOCK_SIZE; i++, j++) {
            const query = allSongs[i].title + " " + allSongs[i].artist;
            promises.push(ytSearch(query));
        }

        for (let i = blockID * BLOCK_SIZE, j = 0; i < allSongs.length && j < BLOCK_SIZE; i++, j++) {
            const result = await promises[j];
            const videoURL = result.videos[0].url;
            const videoID = videoURL.split('watch?v=')[1];
            allSongs[i].id = videoID;

            if ((i + 1) % 10 === 0) {
                console.log("Processed " + (i + 1) + " out of " + allSongs.length + " songs.")
            }
        }
    }

    fs.writeFile('db.json', JSON.stringify(allSongs), (err) => {
        if (err) {
            console.error('Error writing file:', err);
        } else {
            console.log('File written successfully!');
        }
    });
}

async function downloadSongsDB(songsDB) {
    const BLOCK_SIZE = 4;
    for (let blockID = 0; blockID < Math.ceil(songsDB.length / BLOCK_SIZE); blockID++) {
        console.log("Starting block " + blockID + " at i=" + (blockID * BLOCK_SIZE));

        const promises = [];
        for (let i = blockID * BLOCK_SIZE, j = 0; i < songsDB.length && j < BLOCK_SIZE; i++, j++) {
            promises.push(downloadFirebase(songsDB[i].url));
        }

        for (let i = blockID * BLOCK_SIZE, j = 0; i < songsDB.length && j < BLOCK_SIZE; i++, j++) {
            await promises[j];
            if ((i + 1) % 10 === 0) {
                console.log("Downloaded " + (i + 1) + " out of " + songsDB.length + " songs.")
            }
        }
    }
}

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

async function uploadFirebase(videoUrl) {
    const videoID = videoUrl.split('watch?v=')[1];
    const filePath = `audio/${videoID}.mp3`;
    const file = bucket.file(`songs/${videoID}.mp3`);

    try {
        const [exists] = await file.exists();

        if (exists) {
            const [url] = await file.getSignedUrl({
                action: 'read',
                expires: '03-09-2030'
            });
            console.log(`${url} already exists in Firebase Storage.`);
            return url;
        }

        return await new Promise((resolve, reject) => {
            exec(`yt-dlp -f bestaudio -x --download-sections "*1:00-1:10" --force-overwrites --audio-format mp3 -o "${filePath}" ${videoUrl}`, async (error) => {
                if (error) {
                    console.error(`Error downloading track: ${error.message}`);
                    reject(error);
                    return;
                }

                console.log(`Downloaded ${videoID}.mp3`);

                try {
                    const destination = `songs/${videoID}.mp3`;
                    await bucket.upload(filePath, {
                        destination,
                        metadata: { contentType: 'audio/mpeg' }
                    });

                    console.log(`Uploaded ${videoID}.mp3 to Firebase Storage.`);

                    const [url] = await bucket.file(destination).getSignedUrl({
                        action: 'read',
                        expires: '03-09-2030'
                    });

                    fs.unlinkSync(filePath);
                    resolve(url);
                } catch (uploadError) {
                    console.error(`Error uploading to Firebase: ${uploadError.message}`);
                    reject(uploadError);
                }
            });
        });
    } catch (err) {
        console.error(`Unexpected error: ${err.message}`);
        return null;
    }
}

// await updateSongDB();

const lobbies = {};

const allSongs = JSON.parse(fs.readFileSync(`./db.json`, 'utf8'));
for (let i = 0; i < allSongs.length; i++) {
    allSongs[i].cover = `https://img.youtube.com/vi/${allSongs[i].id}/0.jpg`;
    allSongs[i].url = `https://www.youtube.com/watch?v=${allSongs[i].id}`;
    delete allSongs[i].id;
}

// await downloadSongsDB(allSongs);
console.log("Loaded the songs DB of " + allSongs.length + " songs.");
console.log("Downloaded " + numberOfDownloads + " songs.");

async function announceRoundStart(lobbyName) {
    if (!lobbies[lobbyName]) return;

    lobbies[lobbyName].players.forEach(player => player.choice = -1);
    lobbies[lobbyName].roundStarted = true;
    lobbies[lobbyName].currentRound += 1;
    lobbies[lobbyName].firstAnswserPlayerId = '';

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

    lobbies[lobbyName].timeInterval = timerInterval;
}

async function announceRoundEnd(lobbyName) {
    if (!lobbies[lobbyName]) {
        return;
    }

    clearInterval(lobbies[lobbyName].timeInterval);
    lobbies[lobbyName].roundStarted = false;
    io.to(lobbyName).emit('onRoundEnd');

    if (lobbies[lobbyName].rounds - lobbies[lobbyName].currentRound > 0) {
        announceRoundStart(lobbyName);
    } else {
        console.log("Game ended.");
        io.to(lobbyName).emit('onGameEnd');
        delete lobbies[lobbyName];
    }
}

io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    socket.emit('onLobbyListChanged', Object.keys(lobbies));

    socket.on('createLobby', async (lobbyName, username) => {
        if (lobbies[lobbyName]) {
            socket.emit('createLobbyResponse', lobbyName, 'Lobby already exists!');
            return;
        }

        lobbies[lobbyName] = {
            players: [{ id: socket.id, username: username, choice: -1, score: 0 }],
            roundStarted: false,
            currentRound: 0,
            rounds: 0
        };
        socket.join(lobbyName);
        socket.emit('createLobbyResponse', lobbyName, '');
        io.emit('onLobbyListChanged', Object.keys(lobbies));
        io.to(lobbyName).emit('onPlayersChanged', lobbies[lobbyName].players.sort((a, b) => b.score - a.score));
        console.log(`Lobby created: ${lobbyName}, by: ${username}`);
    });

    socket.on('joinLobby', async (lobbyName, username) => {
        if (!lobbies[lobbyName]) {
            socket.emit('joinLobbyResponse', 'Lobby does not exist!');
            return;
        }

        for (const player of lobbies[lobbyName].players) {
            if (player.name === username) {
                socket.emit('joinLobbyResponse', 'Player with this name already is in the lobby!');
                return;
            }
            if (player.id === socket.id) {
                socket.emit('joinLobbyResponse', 'This client is already connected to the lobby!');
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
        lobbies[lobbyName].rounds = rounds;
        io.to(lobbyName).emit('onGameStart');
        announceRoundStart(lobbyName);
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
                    if (lobbies[lobbyName].firstAnswserPlayerId === '') {
                        lobbies[lobbyName].firstAnswserPlayerId = socket.id;
                        player.score += 100;
                    }
                    const baseScore = 500;
                    const timeFactor = 1 - Number(lobbies[lobbyName].timePassed) / 20;
                    player.score += Math.round(baseScore * timeFactor * 100) / 100;
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
        setTimeout(() => {
            announceRoundEnd(lobbyName);
        }, 5000);
    });

    socket.on('disconnect', () => {
        for (const lobby in lobbies) {
            lobbies[lobby].players = lobbies[lobby].players.filter(p => p.id !== socket.id);
            io.to(lobby).emit('onPlayersChanged', lobbies[lobby].players.sort((a, b) => b.score - a.score));
            if (lobbies[lobby].players.length === 0) {
                delete lobbies[lobby];
                io.emit('onLobbyListChanged', Object.keys(lobbies));
            }
        }
    });
});

server.listen(2137, () => {
    console.log('Server running on port 2137');
});