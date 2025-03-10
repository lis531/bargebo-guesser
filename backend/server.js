import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import ytSearch from 'yt-search';
import { exec } from 'child_process';
import fs from 'fs';

const NUM_SONGS_TO_GUESS = 4;
const LAST_FM_API_KEY = 'a9a79c6c24df636090cfa7ee4fa2c040';

const app = express();
app.use(cors());

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

async function downloadSong(videoUrl, lobbyName) {    
    return new Promise((resolve, reject) => {
        exec(`yt-dlp -f bestaudio -x --download-sections "*1:00-1:10" --force-overwrites --audio-format mp3 -o "${lobbyName}.%(ext)s" ${videoUrl}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error downloading track: ${error.message}`);
                reject(error);
            } else {
                console.log(`Track downloaded: ${stdout}`);
                resolve(`${lobbyName}.mp3`);
            }
        });
    });
}

async function updateSongDB() {
    let allSongs = await fetchTracks();

    const BLOCK_SIZE = 100;
    for (let blockID = 0; blockID < Math.ceil(allSongs.length / BLOCK_SIZE); blockID++) {
        console.log("Starting block " + blockID + " at i=" + (blockID * BLOCK_SIZE));

        const promises = [];
        for (let i = blockID * BLOCK_SIZE, j = 0; i < allSongs.length, j < BLOCK_SIZE; i++, j++) {
            const query = allSongs[i].title + " " + allSongs[i].artist;
            promises.push(ytSearch(query));
        }

        for (let i = blockID * BLOCK_SIZE, j = 0; i < allSongs.length, j < BLOCK_SIZE; i++, j++) {
            const result = await promises[j];
            const videoURL = result.videos[0].url;
            const videoID = videoURL.split('watch?v=')[1];
            allSongs[i].id = videoID;
    
            if((i+1) % 10 === 0) {
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

//await updateSongDB();

const lobbies = {};

const allSongs = JSON.parse(fs.readFileSync(`./db.json`, 'utf8'));
for (let i = 0; i < allSongs.length; i++) {
    allSongs[i].cover = `https://img.youtube.com/vi/${allSongs[i].id}/0.jpg`;
    allSongs[i].url = `https://www.youtube.com/watch?v=${allSongs[i].id}`;
    delete allSongs[i].id;
}

console.log("Loaded the songs DB of " + allSongs.length + " songs.");

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
            roundStarted: false
        };
        socket.join(lobbyName);

        socket.emit('createLobbyResponse', lobbyName, '');
        io.emit('onLobbyListChanged', Object.keys(lobbies));
        io.to(lobbyName).emit('onPlayersChanged', lobbies[lobbyName].players);

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

        lobbies[lobbyName].players.push({ id: socket.id, name: username, choice: -1 });
        socket.join(lobbyName);

        socket.emit('joinLobbyResponse', '');
        io.to(lobbyName).emit('onPlayersChanged', lobbies[lobbyName].players);

        console.log(`User ${username} joined lobby: ${lobbyName}`);
    });

    socket.on('announceRoundStart', async (lobbyName) => {
        if (!lobbies[lobbyName]) return;

        for (const player of lobbies[lobbyName].players) {
            player.choice = -1;
        }

        lobbies[lobbyName].roundStarted = true;

        console.log("Selecting tracks...");
        const selectedTracks = [];
        for (let i = 0; i < NUM_SONGS_TO_GUESS; i++) {
            const randomIndex = Math.floor(Math.random() * allSongs.length);
            
            selectedTracks.push(allSongs[randomIndex]);
        }

        console.log(selectedTracks);

        const correctIndex = Math.floor(Math.random() * selectedTracks.length);
        const correctVideoUrl = selectedTracks[correctIndex].url;
        
        console.log("Starting download...");

        await downloadSong(correctVideoUrl, lobbyName);

        console.log("Starting round...");

        fs.readFile(`./${lobbyName}.mp3`, (err, data) => {
            if (err !== null) {
                console.log(err);
                return;
            } 
            io.to(lobbyName).emit('onRoundStart', selectedTracks, correctIndex, data);
        });
    });

    socket.on('announceRoundEnd', async (lobbyName) => {
        if (!lobbies[lobbyName]) return;
        lobbies[lobbyName].roundStarted = false;
        io.to(lobbyName).emit('onRoundEnd');
    });

    socket.on('submitAnswer', async (lobbyName, choiceIndex) => {
        if (!lobbies[lobbyName] || lobbies[lobbyName].roundStarted === false) {
            console.log(`${socket.id} submitted answer too late or lobby doesn't exist.`);
            return;
        }

        for (const player of lobbies[lobbyName].players) {
            if (player.id === socket.id) {
                player.choice = choiceIndex;
                break;
            }
        }
    });

    socket.on('disconnect', () => {
        for (const lobby in lobbies) {
            lobbies[lobby].players = lobbies[lobby].players.filter(p => p.id !== socket.id);
            io.to(lobby).emit('onPlayersChanged', lobbies[lobby].players);
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
