import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import ytSearch from 'yt-search';
import { exec } from 'child_process';
import fs from 'fs';

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const lobbies = {};

async function getAccessToken() {
    const clientId = 'b8156c11c6ca4c32b541d3392225aed3';
    const clientSecret = '24d6189fba74450fb8a7917fa150fcea';

    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(clientId + ':' + clientSecret).toString('base64')}`,
        },
        body: 'grant_type=client_credentials',
    });

    const data = await response.json();
    return data.access_token;
}

async function fetchWebApi(endpoint, method, body) {
    const token = await getAccessToken();
    const res = await fetch(`https://api.spotify.com/${endpoint}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        method,
        body: body ? JSON.stringify(body) : undefined,
    });

    return await res.json();
}

async function getPopularTracks() {
    const data = await fetchWebApi('v1/search?q=track&type=track&limit=50', 'GET');
    const popularTracks = data.tracks.items.filter((track) => track.popularity > 50);
    return popularTracks;
}

const fetchTracks = async () => {
    const popularTracks = await getPopularTracks();
    if (popularTracks.length === 0) {
        console.log('No tracks found with popularity > 50.');
        return [];
    }

    const selectedTracks = [];
    for (let i = 0; i < 4; i++) {
        const randomTrack = popularTracks[Math.floor(Math.random() * popularTracks.length)];
        selectedTracks.push(randomTrack);
    }

    const songs = selectedTracks.map(track => ({
        id: track.id,
        title: track.name,
        artist: track.artists.map(artist => artist.name).join(', '),
        cover: track.album.images[0]?.url || '',
        url: track.external_urls.spotify,
    }));
    return songs;
};

async function downloadSong(videoUrl) {
    fs.unlink('downloadedSong.mp3', (err) => {
        if (err && err.code !== 'ENOENT') {
            console.error(`Error removing file: ${err.message}`);
        } else {
            console.log('File removed');
        }
    });
    return new Promise((resolve, reject) => {
        exec(`yt-dlp -x --audio-format mp3 --audio-quality 4 -o "downloadedSong.%(ext)s" ${videoUrl}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error downloading track: ${error.message}`);
                reject(error);
            } else {
                console.log(`Track downloaded: ${stdout}`);
                resolve('downloadedSong.mp3');
            }
        });
    });
}

async function trimSong() {
    return new Promise((resolve, reject) => {
        exec('ffmpeg -i downloadedSong.mp3 -y -ss 40 -to 60 -c copy final.mp3', (error, stdout, stderr) => {
            if (error) {
                console.error(`Error converting track: ${error.message}`);
                reject(error);
            } else {
                console.log(`Track converted: ${stdout}`);
                resolve('final.mp3');
            }
        });
    });
}

io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.emit('onLobbyListChanged', Object.keys(lobbies));

    socket.on('createLobby', (lobbyName, username) => {
        if (lobbies[lobbyName]) {
            socket.emit('createLobbyResponse', lobbyName, 'Lobby already exists!');
            return;
        }

        lobbies[lobbyName] = {
            players: [{ id: socket.id, name: username, choice: -1 }],
            roundStarted: false
        };
        socket.join(lobbyName);

        socket.emit('createLobbyResponse', lobbyName, '');
        io.emit('onLobbyListChanged', Object.keys(lobbies));
        io.to(lobbyName).emit('onPlayersChanged', lobbies[lobbyName].players);

        console.log(`Lobby created: ${lobbyName}, by: ${username}`);
    });

    socket.on('joinLobby', (lobbyName, username) => {
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

        const allSongs = await fetchTracks();
        const correctIndex = 1;

        console.log();

        const query = allSongs[correctIndex].title + " " + allSongs[correctIndex].artist;
        const searchResults = await ytSearch(query);
        const videoUrl = searchResults.videos[0].url;
        //await downloadSong(videoUrl);
        await trimSong();

        fs.readFile('./final.mp3', (err, data) => {
            if (err !== null) {
                console.log();
                return;
            } 
            
            io.to(lobbyName).emit('onRoundStart', allSongs, correctIndex, data);
        });
    });

    socket.on('announceRoundEnd', (lobbyName) => {
        if (!lobbies[lobbyName]) return;
        lobbies[lobbyName].roundStarted = false;
        io.to(lobbyName).emit('onRoundEnd');
    });

    socket.on('submitAnswer', (lobbyName, choiceIndex) => {
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
