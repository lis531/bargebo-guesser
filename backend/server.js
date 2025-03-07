import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const lobbies = {};

io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on('createLobby', (lobbyName, username) => {
        if (lobbies[lobbyName]) {
            socket.emit('createLobbyResponse', lobbyName, 'Lobby already exists!');
            return;
        }

        lobbies[lobbyName] = { players: [{ id: socket.id, name: username }] };
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

        for (var i = 0; i < lobbies[lobbyName].players.length; i++) {
            if (lobbies[lobbyName].players[i].name === username) {
                socket.emit('joinLobbyResponse', 'Player with this name already is in the lobby!');
                return;
            }
            if (lobbies[lobbyName].players[i].id === socket.id) {
                socket.emit('joinLobbyResponse', 'This client is already connected to the lobby!');
                return;
            }
        }

        lobbies[lobbyName].players.push({ id: socket.id, name: username });
        socket.join(lobbyName);

        socket.emit('joinLobbyResponse', '');

        io.to(lobbyName).emit('onPlayersChanged', lobbies[lobbyName].players);

        console.log(`User ${username} joined lobby: ${lobbyName}`);
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