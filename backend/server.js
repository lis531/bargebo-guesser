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
  console.log(`User connected: ${socket.id}`);

  socket.on('createLobby', (lobbyName, username) => {
    if (lobbies[lobbyName]) {
      socket.emit('lobbyError', 'Lobby already exists!');
      return;
    }
    
    lobbies[lobbyName] = { players: [socket.id] };
    socket.join(lobbyName);
    io.emit('lobbyList', Object.keys(lobbies));
    socket.emit('lobbyCreated', lobbyName);
    console.log(`Lobby created: ${lobbyName}, by: ${username}`);
  });

  socket.on('joinLobby', (lobbyName, username) => {
    if (!lobbies[lobbyName]) {
      socket.emit('lobbyError', 'Lobby does not exist!');
      return;
    }

    lobbies[lobbyName].players.push(socket.id);
    socket.join(lobbyName);
    io.to(lobbyName).emit('lobbyJoined', lobbies[lobbyName].players);
    console.log(`User ${username} joined lobby: ${lobbyName}`);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);

    for (const lobby in lobbies) {
      lobbies[lobby].players = lobbies[lobby].players.filter(p => p !== socket.id);
      if (lobbies[lobby].players.length === 0) {
        delete lobbies[lobby];
      }
    }

    io.emit('lobbyList', Object.keys(lobbies));
  });
});

server.listen(2137, () => {
  console.log('Server running on port 2137');
});