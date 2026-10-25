import path from "node:path";
import http from "node:http";
import express from "express";
import { Server } from "socket.io";
import { randomInt } from "crypto";
import { CLIENT, PRIVATE, PUBLIC } from "../shared/messages.js";
import { admitPlayer } from "./session/admitPlayer.js";

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(import.meta.dirname, "..", "client")));
app.use(
  "/shared",
  express.static(path.join(import.meta.dirname, "..", "shared")),
);

const games = new Map();

function gameList() {
  return [...games.entries()].map(([gameId, game]) => ({
    gameId,
    host: game.players.get(game.hostId).name,
    playerCount: game.players.size,
  }));
}

// Keeps the games list up to date
function broadcastGameList() {
  io.emit("gameList", gameList());
}

function sendPlayers(gameId) {
  const game = games.get(gameId);
  const players = [...game.players.values()].map((player) => ({
    id: player.id,
    name: player.name,
    isHost: player.id === game.hostId,
  }));
  io.to(gameId).emit(PUBLIC.LOBBY_UPDATE, { gameId, players });
}

io.on("connection", (socket) => {
  socket.emit("gameList", gameList());

  socket.on(CLIENT.CREATE_GAME, ({ hostName }, callback) => {
    hostName = String(hostName || "")
      .trim()
      .slice(0, 24);

    if (!hostName) {
      return callback({ ok: false, error: "Host name is required." });
    }

    const gameId = generateGameId();
    console.log(
      `Communication: calling Session.admitPlayer for ${hostName} in game ${gameId}`,
    );
    const { playerId } = admitPlayer({ gameId, displayName: hostName });

    const players = new Map();
    players.set(playerId, { id: playerId, name: hostName });
    games.set(gameId, { hostId: playerId, players });

    socket.data.gameId = gameId;
    socket.data.playerId = playerId;
    socket.join(gameId);

    callback({ ok: true, gameId, playerId, host: hostName });
    console.log(`Server: Game ${gameId} created by ${hostName}`);
    sendPlayers(gameId);
    broadcastGameList();
  });

  socket.on(CLIENT.JOIN_GAME, ({ playerName, gameId } = {}, callback) => {
    playerName = String(playerName || "")
      .trim()
      .slice(0, 24);
    gameId = String(gameId || "")
      .trim()
      .toUpperCase();

    if (!playerName) {
      return callback({ ok: false, error: "Name is required." });
    }
    if (!gameId) {
      return callback({ ok: false, error: "Game ID is required." });
    }
    if (socket.data.gameId) {
      return callback({ ok: false, error: "You are already in a game." });
    }

    const game = games.get(gameId);
    if (!game) {
      return callback({ ok: false, error: "Game not found." });
    }

    console.log(
      `Communication: calling Session.admitPlayer for ${playerName} in game ${gameId}`,
    );
    const { playerId } = admitPlayer({ gameId, displayName: playerName });
    game.players.set(playerId, { id: playerId, name: playerName });
    socket.data.gameId = gameId;
    socket.data.playerId = playerId;
    socket.join(gameId);

    callback({ ok: true, gameId, playerId });
    console.log(`Server: ${playerName} joined game ${gameId}`);
    sendPlayers(gameId);
    broadcastGameList();
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});


/**
 * Helpers
 */


// Leaves out characters that are easy to mix up: 0/O, 1/I/L
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateGameId() {
  let id;
  do {
    id = "";
    for (let i = 0; i < 4; i++) {
      id += ALPHABET[randomInt(ALPHABET.length)];
    }
  } while (games.has(id)); // try again if it's already taken
  return id;
}