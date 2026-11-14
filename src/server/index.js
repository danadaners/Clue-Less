import path from "node:path";
import http from "node:http";
import express from "express";
import { Server } from "socket.io";
import { randomInt } from "crypto";
import { CLIENT, PRIVATE, PUBLIC, ERROR_CODES } from "../shared/messages.js";
import { admitPlayer } from "./session/admitPlayer.js";
import { SUSPECT_IDS } from "./game/catalog.js";
import { Lobby } from "./game/Lobby.js";
import { createDeck, createSolution, dealCards } from "./game/cards.js";

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
    host: game.players.get(game.hostId).displayName,
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
    displayName: player.displayName,
    characterId: player.characterId ?? null,
    isHost: player.id === game.hostId,
  }));

  const taken = new Set(players.map((p) => p.characterId).filter(Boolean));
  const availableCharacters = SUSPECT_IDS.filter((c) => !taken.has(c));
  const canStart = game.lobby.canStart(players.length);
  io.to(gameId).emit(PUBLIC.LOBBY_UPDATE, { gameId, players, availableCharacters, canStart });
}

function sendMessageToPlayer(gameId, playerId, message) {
  const game = games.get(gameId);
  const player = game.players.get(playerId);
  player.socket.emit(PRIVATE.MESSAGE, { message });
}

io.on("connection", (socket) => {
  socket.emit("gameList", gameList());

  socket.on(CLIENT.CREATE_GAME, ({ displayName }, callback) => {
    displayName = String(displayName || "")
      .trim()
      .slice(0, 24);

    if (!displayName) {
      return callback({ ok: false, error: "Name is required." });
    }

    const gameId = generateGameId();
    console.log(
      `Communication: calling Session.admitPlayer for ${displayName} in game ${gameId}`,
    );
    const { playerId } = admitPlayer({ gameId, displayName });

    const players = new Map();
    players.set(playerId, { id: playerId, displayName, socket: socket });
    games.set(gameId, { hostId: playerId, players, lobby: new Lobby(playerId), started: false });

    socket.data.gameId = gameId;
    socket.data.playerId = playerId;
    socket.join(gameId);

    callback({ ok: true, gameId, playerId, displayName });
    console.log(`Server: Game ${gameId} created by ${displayName}`);
    sendPlayers(gameId);
    broadcastGameList();
  });

  socket.on(CLIENT.JOIN_GAME, ({ displayName, gameId } = {}, callback) => {
    displayName = String(displayName || "")
      .trim()
      .slice(0, 24);
    gameId = String(gameId || "")
      .trim()
      .toUpperCase();

    if (!displayName) {
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
    if (game.started) {
      return callback({ ok: false, error: "That game has already started." });
    }

    console.log(
      `Communication: calling Session.admitPlayer for ${displayName} in game ${gameId}`,
    );
    const { playerId } = admitPlayer({ gameId, displayName });
    game.players.set(playerId, { id: playerId, displayName, socket });
    socket.data.gameId = gameId;
    socket.data.playerId = playerId;
    socket.join(gameId);

    callback({ ok: true, gameId, playerId });
    console.log(`Server: ${displayName} joined game ${gameId}`);
    sendPlayers(gameId);

    const message = `${displayName} has joined your game!`
    sendMessageToPlayer(gameId, game.hostId, message);
    broadcastGameList();
  });

  socket.on(CLIENT.SELECT_CHARACTER, ({ characterId } = {}, callback) => {
    const { gameId, playerId } = socket.data;
    const game = games.get(gameId);
    if (!game) {
      return callback({ ok: false, error: "Join a game first." });
    }
    if (game.started) {
      return callback({ ok: false, error: "The game has already started." });
    }
    if (!SUSPECT_IDS.includes(characterId)) {
      return callback({ ok: false, error: "Unknown character." });
    }

    console.log(`Communication: calling Lobby.selectCharacter(${characterId}) in game ${gameId}`);
    try {
      game.lobby.selectCharacter(playerId, characterId);
    } catch (err) {
      return callback({ ok: false, error: err.message });
    }
    game.players.get(playerId).characterId = characterId;

    callback({ ok: true, characterId });
    console.log(`Server: ${game.players.get(playerId).displayName} selected ${characterId}`);
    sendPlayers(gameId);
  });

  // Placeholder start: checks host + lobby, then moves everyone to the game screen.
  // Board, cards, and turn order come in the Minimal increment.
  socket.on(CLIENT.START_GAME, (_payload, callback) => {
    const { gameId, playerId } = socket.data;
    const game = games.get(gameId);
    if (!game) {
      return callback({ ok: false, error: "Join a game first." });
    }
    if (playerId !== game.hostId) {
      return callback({ ok: false, code: ERROR_CODES.NOT_HOST, error: "Only the host can start the game." });
    }
    if (!game.lobby.canStart(game.players.size)) {
      return callback({
        ok: false,
        code: ERROR_CODES.START_NOT_READY,
        error: "Need 3-6 players, and everyone must choose a character.",
      });
    }

    game.started = true;
    callback({ ok: true });
    console.log(`Server: game ${gameId} started`);

    const players = [...game.players.values()];
    
    const { solution, rest } = createSolution(createDeck());
    game.solution = solution; // stays on the server, never sent to clients
    dealCards(rest, players);

    // Everyone sees how many cards each player has, but not which cards
    const publicPlayers = players.map(({ id, displayName, characterId, hand }) => ({
      id,
      displayName,
      characterId,
      cardCount: hand.length,
    }));

    // game_started is private (SRS B.4): later each player gets only their own hand
    for (const player of players) {
      player.socket.emit(PRIVATE.GAME_STARTED, {
        gameId,
        players: publicPlayers,
        hand: player.hand,
      });
    }
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