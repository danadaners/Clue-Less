/**
 * Client entry point.
 */
import { CLIENT, PRIVATE, PUBLIC } from "../shared/messages.js";

const socket = io();

/** UI elements */
const $ = (id) => document.getElementById(id);

const createBtn = $("create-btn");
const joinBtn = $("join-btn");
const joinPanel = $("join-panel");
const joinSubmitBtn = $("join-submit-btn");
const nameInput = $("display-name");
const gameIdInput = $("game-id");
const homeError = $("home-error");
const lobbyView = $("lobby-view");
const lobbyGameId = $("lobby-game-id");
const playerList = $("player-list");

function showError(message) {
  homeError.textContent = message;
}

function clearError() {
  homeError.textContent = "";
}

function showLobby(gameId) {
  lobbyGameId.textContent = gameId;
  lobbyView.hidden = false;
}

function renderPlayers(players) {
  playerList.replaceChildren();
  for (const player of players) {
    const li = document.createElement("li");
    li.textContent = player.isHost ? `${player.name} (host)` : player.name;
    playerList.appendChild(li);
  }
}

// Create Game
createBtn.addEventListener("click", () => {
  const hostName = nameInput.value.trim();
  if (!hostName) {
    showError("Name cannot be blank.");
    return;
  }
  clearError();
  socket.emit(CLIENT.CREATE_GAME, { hostName }, (res) => {
    if (!res || !res.ok) {
      showError(res?.error || "Could not create the game.");
      return;
    }

    showLobby(res.gameId);
    console.log(`Client: Game ${res.gameId} created by ${res.host}`);
  });
});

joinBtn.addEventListener("click", () => {
  joinPanel.hidden = !joinPanel.hidden;
});

joinSubmitBtn.addEventListener("click", () => {
  const playerName = nameInput.value.trim();
  const gameId = gameIdInput.value.trim().toUpperCase();
  if (!playerName) {
    showError("Name cannot be blank.");
    return;
  }
  if (!gameId) {
    showError("Game ID is required.");
    return;
  }
  clearError();
  socket.emit(CLIENT.JOIN_GAME, { playerName, gameId }, (res) => {
    if (!res || !res.ok) {
      showError(res?.error || "Could not join the game.");
      return;
    }

    showLobby(res.gameId);
    console.log(`Client: ${playerName} joined game ${res.gameId}`);
  });
});

socket.on("gameList", (games) => {
  const list = $("game-list");
  list.innerHTML = "";

  if (games.length === 0) {
    list.innerHTML = '<li class="muted">No games yet.</li>';
    return;
  }

  for (const { gameId, host } of games) {
    const li = document.createElement("li");
    li.textContent = `${host}'s game`;
    const id = document.createElement("div");
    id.className = "muted";
    id.textContent = gameId;
    li.appendChild(id);
    list.appendChild(li);
  }
});

socket.on(PUBLIC.LOBBY_UPDATE, ({ gameId, players }) => {
  showLobby(gameId);
  renderPlayers(players);
});
