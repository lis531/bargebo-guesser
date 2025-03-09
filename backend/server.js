import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import ytSearch from 'yt-search';
import { exec } from 'child_process';
import fs from 'fs';

const NUM_SONGS_TO_GUESS = 4;

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

async function fetchSpotifyAPI(endpoint, method, body) {
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

async function fetchTracks() {
    const allTracks = [];
    const totalSongs = 1000;
    const limit = 50;

    for (let offset = 0; offset < totalSongs; offset += limit) {
        const response = await fetchSpotifyAPI(`v1/search?q=track&type=track&limit=${limit}&offset=${offset}&market=US`, 'GET');
        allTracks.push(...response.tracks.items);
    }

    let popularityMargin = 60;

    console.log(`Fetched ${allTracks.length} tracks`);
    const popularTracks = allTracks.filter(track => track.popularity > popularityMargin) || [];
    console.log(`Filtered ${popularTracks.length} popular tracks`);

    // sortowanie rasowe
    function isEnglish(text) {
        return /^[A-Za-z0-9\s.,'!?()-]+$/.test(text);
    }
    const englishTracks = popularTracks.filter(track => isEnglish(track.name) && isEnglish(track.artists.map(a => a.name).join(' ')));

    const songs = englishTracks.map((track, index) => ({
        id: index,
        title: track.name,
        artist: track.artists.map(artist => artist.name).join(', '),
        cover: track.album.images[0]?.url || '',
        url: track.external_urls.spotify,
    }));

    return songs;
}

async function selectTracks (allTracks) {
    const selectedTracks = [];

    for (let i = 0; i < NUM_SONGS_TO_GUESS; i++) {
        const randomIndex = Math.floor(Math.random() * allTracks.length);
        const randomTrack = allTracks[randomIndex];
        selectedTracks.push(randomTrack);
    }

    return selectedTracks;
}

async function downloadSong(videoUrl) {
    fs.unlink('downloadedSong.mp3', (err) => {
        if (err && err.code !== 'ENOENT') {
            console.error(`Error removing file: ${err.message}`);
        } else {
            console.log('File removed');
        }
    });
    
    return new Promise((resolve, reject) => {
        exec(`yt-dlp -x --download-sections "*0:40-0:50" --audio-format mp3 --audio-quality 4 -o "downloadedSong.%(ext)s" ${videoUrl}`, (error, stdout, stderr) => {
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
    let allSongs = [];

    socket.emit('onLobbyListChanged', Object.keys(lobbies));

    socket.on('createLobby', async (lobbyName, username) => {
        allSongs = await fetchTracks();

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

        const selectedTracks = await selectTracks(allSongs);
        const correctIndex = Math.floor(Math.random() * selectedTracks.length);

        const query = selectedTracks[correctIndex].title + " " + selectedTracks[correctIndex].artist;
        const searchResults = await ytSearch(query);
        const videoUrl = searchResults.videos[0].url;
        
        await downloadSong(videoUrl);
        //await trimSong();

        fs.readFile('./downloadedSong.mp3', (err, data) => {
            if (err !== null) {
                console.log();
                return;
            } 
            
            io.to(lobbyName).emit('onRoundStart', selectedTracks, correctIndex, data);
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
