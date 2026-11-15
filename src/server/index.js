import path from "node:path";
import http from "node:http";
import express from "express";
import { Server } from "socket.io";
import { randomInt } from "crypto";
import { CLIENT, PRIVATE, PUBLIC, ERROR_CODES } from "../shared/messages.js";
import { admitPlayer } from "./session/admitPlayer.js";
import { SUSPECT_IDS } from "./game/catalog.js";
import { Lobby } from "./game/Lobby.js";
import {
  beginPlay,
  endTurn,
  listLegalMovesForPlayer,
  movePlayer,
  getActivePlayerId,
} from "./game/play.js";
import { createDeck, createSolution, dealCards } from "./game/cards.js";
import { GAME_PHASE, TURN_PHASE } from "./game/turn.js";

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

/** Public in-progress snapshot for game_state_update. */
function publicGameState(gameId, game) {
  return {
    gameId,
    activePlayerId: getActivePlayerId(game),
    turnPhase: game.turnPhase,
    stateVersion: game.stateVersion ?? 0,
    characterPositions: game.board.getCharacterPositions(),
    phase: game.phase,
  };
}

function broadcastGameState(gameId, extra = {}) {
  const game = games.get(gameId);
  if (!game?.board) {
    return;
  }
  const state = { ...publicGameState(gameId, game), ...extra };
  io.to(gameId).emit(PUBLIC.GAME_STATE_UPDATE, state);

  // Active player also gets their current legal moves privately.
  if (game.phase === GAME_PHASE.IN_PROGRESS && state.activePlayerId) {
    const active = game.players.get(state.activePlayerId);
    if (active?.socket) {
      active.socket.emit(PRIVATE.PLAYER_VIEW_UPDATE, {
        gameId,
        activePlayerId: state.activePlayerId,
        turnPhase: state.turnPhase,
        stateVersion: state.stateVersion,
        legalMoves:
          state.turnPhase === TURN_PHASE.AWAITING_MOVE
            ? listLegalMovesForPlayer(game, state.activePlayerId)
            : [],
        canEndTurn:
          state.turnPhase === TURN_PHASE.TURN_COMPLETE ||
          state.turnPhase === TURN_PHASE.AWAITING_SUGGESTION,
      });
    }
  }
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

  // Host start: lobby checks, then place tokens and initialize turn order (5.3 / 5.7).
  // Cards / suggestions / accusations still come from later Minimal work.
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

    let play;
    try {
      play = beginPlay(game);
    } catch (err) {
      return callback({ ok: false, code: err.code, error: err.message });
    }

    game.started = true;
    callback({ ok: true });
    console.log(
      `Server: game ${gameId} started; activePlayer=${play.activePlayerId}`,
    );

    // Deal in turn order (set by beginPlay)
    const players = game.turnOrder.map(({ playerId }) => game.players.get(playerId));
    
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

    // game_started is private (SRS B.4): each player gets only their own hand
    for (const player of players) {
      player.socket.emit(PRIVATE.GAME_STARTED, {
        gameId,
        players: publicPlayers,
        activePlayerId: play.activePlayerId,
        turnPhase: play.turnPhase,
        characterPositions: play.characterPositions,
        stateVersion: game.stateVersion ?? 0,
        hand: player.hand,
      });
    }
    broadcastGameState(gameId);
    broadcastGameList();
  });

  socket.on(CLIENT.MOVE_PLAYER, (payload = {}, callback) => {
    const { gameId, playerId } = socket.data;
    const game = games.get(gameId);
    if (!game?.started || !game.board) {
      return callback?.({ ok: false, error: "Game is not in progress." });
    }

    try {
      const result = movePlayer(game, playerId, {
        moveType: payload.moveType,
        destinationId: payload.destinationId,
      });
      callback?.({ ok: true, ...result });
      console.log(
        `Server: ${game.players.get(playerId).displayName} moved (${payload.moveType})`,
      );
      broadcastGameState(gameId, {
        lastAction: {
          kind: "move",
          playerId,
          moveType: payload.moveType,
          destinationId: payload.destinationId,
        },
      });
    } catch (err) {
      return callback?.({
        ok: false,
        code: err.code || ERROR_CODES.ACTION_NOT_ALLOWED,
        error: err.message,
      });
    }
  });

  socket.on(CLIENT.END_TURN, (_payload, callback) => {
    const { gameId, playerId } = socket.data;
    const game = games.get(gameId);
    if (!game?.started || !game.board) {
      return callback?.({ ok: false, error: "Game is not in progress." });
    }

    try {
      const result = endTurn(game, playerId);
      callback?.({ ok: true, ...result });
      console.log(
        `Server: ${game.players.get(playerId).displayName} ended turn; active=${result.activePlayerId}`,
      );
      broadcastGameState(gameId, {
        lastAction: { kind: "turn", playerId, activePlayerId: result.activePlayerId },
      });
    } catch (err) {
      return callback?.({
        ok: false,
        code: err.code || ERROR_CODES.ACTION_NOT_ALLOWED,
        error: err.message,
      });
    }
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