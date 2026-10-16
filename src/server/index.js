const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');


const PORT = process.env.PORT || 3000;


const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve the browser client
app.use(express.static(path.join(__dirname, '..', 'client')));

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Clue-Less server running at http://localhost:${PORT}`);
});