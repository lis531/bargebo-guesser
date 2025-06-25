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
    universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL
};

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "bargebo-27328.firebasestorage.app",
    databaseURL: process.env.FIREBASE_DATABASE_URL
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

const db = admin.database();

let allSongs = [];
let artists = [];

function loadSongsFromDatabase() {
    db.ref('/songs').on('value', (snapshot) => {
        try {
            const songsData = snapshot.val();
            if (songsData && Array.isArray(songsData)) {
                allSongs = songsData.map(song => ({
                    ...song,
                    cover: `https://img.youtube.com/vi/${song.id}/0.jpg`,
                    url: `https://www.youtube.com/watch?v=${song.id}`
                }));
                
                artists = allSongs.map(song => song.artist).filter((value, index, self) => self.indexOf(value) === index);
                console.log(`Loaded songs from Firebase: ${allSongs.length} songs, ${artists.length} artists.`);
            } else {
                console.log("No songs found in Firebase database or invalid format.");
                allSongs = [];
                artists = [];
            }
        } catch (error) {
            console.error("Error processing songs from Firebase:", error);
            allSongs = [];
            artists = [];
        }
    })
}

loadSongsFromDatabase();

setInterval(() => {
    console.log("Performing periodic refresh of songs data...");
    loadSongsFromDatabase();
}, 60 * 60 * 1000);

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
        const file = bucket.file(`songs/${videoID}.opus`);
        const [exists] = await file.exists();

        if (exists) {
            await file.getSignedUrl({
                action: 'read',
                expires: '03-09-2030'
            });

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

async function announceRoundStart(lobbyName) {
    if (!lobbies[lobbyName]) return;

    lobbies[lobbyName].players.forEach(player => player.choice = -1);
    lobbies[lobbyName].roundStarted = true;
    lobbies[lobbyName].currentRound += 1;
    lobbies[lobbyName].firstAnswerPlayerId = '';
    lobbies[lobbyName].secondAnswerPlayerId = '';
    lobbies[lobbyName].thirdAnswerPlayerId = '';
    lobbies[lobbyName].roundStartTimestamp = null;
    io.emit('onLobbyListChanged', getPublicLobbies());

    const filteredSongs = lobbies[lobbyName].selectedArtists !== null ? allSongs.filter(song => lobbies[lobbyName].selectedArtists.includes(song.artist)) : allSongs;
    const selectedTracks = [];
    for (let i = 0; i < NUM_SONGS_TO_GUESS; i++) {
        const randomIndex = Math.floor(Math.random() * filteredSongs.length);
        if (selectedTracks.length > 0) {
            if (selectedTracks.some(track => track.title === filteredSongs[randomIndex].title)) {
                i--;
                continue;
            }
        }
        selectedTracks.push(filteredSongs[randomIndex]);
    }
    console.log("Selected tracks: " + selectedTracks.map(track => track.title).join(", "));

    const correctIndex = Math.floor(Math.random() * selectedTracks.length);
    const correctVideoUrl = selectedTracks[correctIndex].url;
    lobbies[lobbyName].selectedTracks = selectedTracks;
    lobbies[lobbyName].correctIndex = correctIndex;

    console.log("Fetching song from Firebase...");

    let correctSongData = await downloadFirebase(correctVideoUrl);
    if (!correctSongData) {
        console.error("Failed to start round: Song data missing.");
        return;
    }
    if (!lobbies[lobbyName]) return;
    console.log("Starting round " + lobbies[lobbyName].currentRound);
    setTimeout(() => {
        if (!lobbies[lobbyName]) return;
        lobbies[lobbyName].roundStartTimestamp = Date.now();
        lobbies[lobbyName].correctSongData = correctSongData;
        const minScore = 0;
        io.to(lobbyName).emit('onRoundStart', lobbies[lobbyName].selectedTracks, lobbies[lobbyName].correctIndex, correctSongData, lobbies[lobbyName].currentRound, lobbies[lobbyName].roundStartTimestamp, minScore);
        lobbies[lobbyName].answerTimeout = setTimeout(() => {
            if (!lobbies[lobbyName]) return;
            announceRoundEnd(lobbyName);
        }, lobbies[lobbyName].roundDuration * 1000);
        if (lobbies[lobbyName].gameMode === "ultraInstinct") {
            setTimeout(() => {
                if (!lobbies[lobbyName]) return;
                io.to(lobbyName).emit('stopAudio');
            }, 1500)
        }
    }, lobbies[lobbyName].currentRound == 1 ? 0 : 3500);
}

async function announceRoundEnd(lobbyName) {
    if (!lobbies[lobbyName]) {
        return;
    }

    clearTimeout(lobbies[lobbyName].answerTimeout);

    lobbies[lobbyName].roundStarted = false;

    if (lobbies[lobbyName].rounds - lobbies[lobbyName].currentRound > 0) {
        io.to(lobbyName).emit('onRoundEnd');
        announceRoundStart(lobbyName);
    } else {
        console.log("Game ended.");
        io.to(lobbyName).emit('onGameEnd', lobbies[lobbyName].players);
        for (const player of lobbies[lobbyName].players) {
            if (!player.isHost) {
                const socketToKick = io.sockets.sockets.get(player.id);
                if (socketToKick) {
                    socketToKick.leave(lobbyName);
                }
            }
        }
        lobbies[lobbyName].players = lobbies[lobbyName].players.filter(player => player.isHost);
        io.to(lobbyName).emit('onPlayersChanged', lobbies[lobbyName].players.sort((a, b) => b.score - a.score));
        io.emit('onLobbyListChanged', getPublicLobbies());
        lobbies[lobbyName].players[0].score = 0;
    }
}

function getPublicLobbies() {
    const publicLobbies = {};
    for (const [name, lobby] of Object.entries(lobbies)) {
        publicLobbies[name] = {
            players: lobby.players.map(p => ({
                username: p.username,
                score: p.score,
                isHost: p.isHost
            })),
            roundStarted: lobby.roundStarted,
            currentRound: lobby.currentRound,
            rounds: lobby.rounds
        };
    }
    return publicLobbies;
}

function leaveLobby(socket) {
    for (const lobby in lobbies) {
        lobbies[lobby].players = lobbies[lobby].players.filter(p => p.id !== socket.id);
        const socketToKick = io.sockets.sockets.get(socket.id);
        if (socketToKick) {
            socketToKick.leave(lobby);
        }
        console.log(`Client disconnected: ${socket.id}`);
        if (lobbies[lobby].players.length === 0) {
            clearTimeout(lobbies[lobby].answerTimeout);
            delete lobbies[lobby];
            console.log(`Lobby ${lobby} deleted`);
        } else {
            if (lobbies[lobby].players.length > 0) {
                lobbies[lobby].players[0].isHost = true;
            }
            io.to(lobby).emit('onPlayersChanged', lobbies[lobby].players.sort((a, b) => b.score - a.score));
        }
        io.emit('onLobbyListChanged', getPublicLobbies());
    }
}

io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    socket.emit('onLobbyListChanged', getPublicLobbies());

    socket.on('createLobby', async (lobbyName, username) => {
        if (lobbies[lobbyName]) {
            socket.emit('createLobbyResponse', lobbyName, 'Lobby already exists!');
            return;
        }

        lobbies[lobbyName] = {
            players: [{ id: socket.id, username: username, choice: -1, score: 0, isHost: true }],
            roundStarted: false,
            currentRound: 0,
            rounds: 0,
            gameMode: 'normal',
            roundDuration: 30,
            selectedTracks: [],
            correctIndex: -1,
            correctSongData: null,
            firstAnswerPlayerId: '',
            secondAnswerPlayerId: '',
            thirdAnswerPlayerId: '',
            timeSinceFirstAnswer: 0,
            answerTimeout: null,
            podiumBonusScore: false
        };
        socket.join(lobbyName);
        socket.emit('createLobbyResponse', lobbyName, '', artists);
        io.emit('onLobbyListChanged', getPublicLobbies());
        io.to(lobbyName).emit('onPlayersChanged', lobbies[lobbyName].players.sort((a, b) => b.score - a.score));
        console.log(`Lobby ${lobbyName} created by ${username}`);
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
        socket.emit('joinLobbyResponse', '', lobbies[lobbyName].rounds, lobbies[lobbyName].roundDuration);
        io.emit('onLobbyListChanged', getPublicLobbies());
        io.to(lobbyName).emit('onPlayersChanged', lobbies[lobbyName].players.sort((a, b) => b.score - a.score));
        console.log(`User ${username} joined lobby ${lobbyName}`);

        if (lobbies[lobbyName].roundStarted) {
            const { selectedTracks, correctIndex, correctSongData, currentRound, roundStartTimestamp } = lobbies[lobbyName];
            const minScore = 0;
            socket.emit('onRoundStart', selectedTracks, correctIndex, correctSongData, currentRound, roundStartTimestamp, minScore);
        }
    });

    socket.on('reconnectLobby', async (lobbyName, username) => {
        lobbies[lobbyName].players.push({ id: socket.id, username: username, choice: -1, score: 0 });
        socket.join(lobbyName);
        io.to(lobbyName).emit('onPlayersChanged', lobbies[lobbyName].players.sort((a, b) => b.score - a.score));
        console.log(`User ${username} joined lobby ${lobbyName}`);
    });

    socket.on('announceGameStart', async (lobbyName, rounds, gameMode, roundDuration, podiumBonusScore, selectedArtists) => {
        if (!lobbies[lobbyName]) return;
        const host = lobbies[lobbyName].players.find(player => player.id === socket.id);
        if (!host || !host.isHost) {
            socket.emit('onGameStartResponse', 'You are not the host!');
            return;
        }
        if (rounds < 1 || rounds > 30) {
            socket.emit('onGameStartResponse', 'Invalid number of rounds!');
            return;
        }
        if (gameMode !== 'normal' && gameMode !== 'stayAlive' && gameMode !== 'firstToAnswer' && gameMode !== 'ultraInstinct') {
            socket.emit('onGameStartResponse', 'Invalid game mode!');
            return;
        }
        if (roundDuration < 5 || roundDuration > 60) {
            socket.emit('onGameStartResponse', 'Invalid round duration!');
            return;
        }
        if (selectedArtists.length > 0) {
            if (allSongs.filter(song => selectedArtists.includes(song.artist)).length < NUM_SONGS_TO_GUESS) {
                socket.emit('onGameStartResponse', 'Not enough songs from selected artists!');
                return;
            }
        }
        lobbies[lobbyName].rounds = rounds;
        lobbies[lobbyName].gameMode = gameMode;
        if (gameMode === 'ultraInstinct') {
            lobbies[lobbyName].roundDuration = 5;
        } else {
            lobbies[lobbyName].roundDuration = roundDuration;
        }
        lobbies[lobbyName].podiumBonusScore = podiumBonusScore;
        lobbies[lobbyName].roundStarted = false;
        lobbies[lobbyName].currentRound = 0;
        lobbies[lobbyName].firstAnswserPlayerId = '';
        lobbies[lobbyName].secondAnswerPlayerId = '';
        lobbies[lobbyName].thirdAnswerPlayerId = '';
        lobbies[lobbyName].timeSinceFirstAnswer = 0;
        lobbies[lobbyName].roundStartTimestamp = null;
        lobbies[lobbyName].selectedArtists = selectedArtists.length > 0 ? selectedArtists : null;
        for (const player of lobbies[lobbyName].players) {
            player.score = 0;
            console.log(player.username + " score: " + player.score);
            player.choice = -1;
        }
        io.to(lobbyName).emit('onPlayersChanged', lobbies[lobbyName].players.sort((a, b) => b.score - a.score));
        io.to(lobbyName).emit('onGameStart', lobbies[lobbyName].roundDuration, lobbies[lobbyName].rounds);
        announceRoundStart(lobbyName);
    });

    socket.on('announceRoundStart', async (lobbyName) => {
        announceRoundStart(lobbyName);
    });

    socket.on('submitAnswer', async (choiceIndex) => {
        if (choiceIndex < 0 || choiceIndex > 3) {
            console.log(`Invalid choice index: ${choiceIndex}`);
            return;
        }
        const entry = Object.entries(lobbies)
            .find(([_, lobby]) =>
                lobby.players.some(p => p.id === socket.id)
            );
        if (!entry) {
            console.log(`Socket ${socket.id} tried to answer but isn't in any lobby.`);
            return;
        }
        const [lobbyName, lobby] = entry;

        if (!lobby.roundStarted) {
            console.log(`Lobby ${lobbyName} exists but round not started.`);
            return;
        }

        for (const player of lobby.players) {
            if (player.id === socket.id) {
                player.choice = choiceIndex;
                console.log(`Player ${player.username} answered with ${choiceIndex}`);
                if (choiceIndex === lobby.correctIndex) {
                    if (lobby.timeSinceFirstAnswer === 0) {
                        lobby.timeSinceFirstAnswer = Date.now() - lobby.roundStartTimestamp;
                    }
                    if (lobby.podiumBonusScore) {
                        if (!lobby.firstAnswerPlayerId) {
                            lobby.firstAnswerPlayerId = socket.id;
                            player.score += 50;
                        } else if (!lobby.secondAnswerPlayerId) {
                            lobby.secondAnswerPlayerId = socket.id;
                            player.score += 25;
                        } else if (!lobby.thirdAnswerPlayerId) {
                            lobby.thirdAnswerPlayerId = socket.id;
                            player.score += 10;
                        }
                    }
                    const maxScore = 500, minScore = 80, timeLimit = lobby.roundDuration;
                    const timePassed = (Date.now() - lobby.roundStartTimestamp) / 1000;
                    if (lobby.gameMode === "firstToAnswer") {
                        // nie wiem czy to działa
                        player.score += Math.round(minScore + (maxScore - minScore) * (1 / timePassed - lobby.timeSinceFirstAnswer));
                    } else {
                        if (timePassed <= 0.5) {
                            player.score += maxScore;
                        } else {
                            const factor = Math.exp(-2 * (timePassed / timeLimit));
                            player.score += Math.round(minScore + (maxScore - minScore) * factor);
                        }
                    }
                }
                break;
            }
        }

        io.to(lobbyName).emit('onPlayersChanged', lobby.players.sort((a, b) => b.score - a.score));

        const allAnswered = lobby.players.every(p => p.choice !== -1);
        if (allAnswered) {
            console.log(`All players in lobby ${lobbyName} answered, showing results...`);
            if (lobby.roundDuration - ((Date.now() - lobby.roundStartTimestamp) / 1000) > 4) {
                if (lobby.answerTimeout) clearTimeout(lobby.answerTimeout);
                setTimeout(() => {
                    announceRoundEnd(lobbyName);
                }, 4000);
            }
        } else {
            console.log(`Waiting on ${lobby.players.filter(p => p.choice === -1).length} players...`);
        }
    });

    socket.on('disconnect', () => {
        leaveLobby(socket);
    });

    socket.on('leaveLobby', () => {
        leaveLobby(socket);
    });

    socket.emit('pingForOffset', Date.now());
});  

server.listen(PORT, () => {
    console.log('Server running on port:' + PORT);
});