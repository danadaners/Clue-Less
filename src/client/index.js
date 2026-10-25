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
  const gameRow = $("lobby-game-row");
  playerList.replaceChildren(gameRow);
  for (const player of players) {
    const li = document.createElement("li");
    li.textContent = player.isHost
      ? `${player.displayName} (host)`
      : player.displayName;
    playerList.appendChild(li);
  }
}

// Create Game
createBtn.addEventListener("click", () => {
  const displayName = nameInput.value.trim();
  if (!displayName) {
    showError("Name cannot be blank.");
    return;
  }
  clearError();
  socket.emit(CLIENT.CREATE_GAME, { displayName }, (res) => {
    if (!res || !res.ok) {
      showError(res?.error || "Could not create the game.");
      return;
    }

    showLobby(res.gameId);
    console.log(`Client: Game ${res.gameId} created by ${res.displayName}`);
  });
});

joinBtn.addEventListener("click", () => {
  joinPanel.classList.toggle("is-open");
});

joinSubmitBtn.addEventListener("click", () => {
  const displayName = nameInput.value.trim();
  const gameId = gameIdInput.value.trim().toUpperCase();
  if (!displayName) {
    showError("Name cannot be blank.");
    return;
  }
  if (!gameId) {
    showError("Game ID is required.");
    return;
  }
  clearError();
  socket.emit(CLIENT.JOIN_GAME, { displayName, gameId }, (res) => {
    if (!res || !res.ok) {
      showError(res?.error || "Could not join the game.");
      return;
    }

    showLobby(res.gameId);
    console.log(`Client: ${displayName} joined game ${res.gameId}`);
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
    const name = document.createElement("span");
    name.textContent = `${host}'s game`;
    const id = document.createElement("span");
    id.className = "game-code";
    id.textContent = gameId;
    li.append(name, id);
    list.appendChild(li);
  }
});

socket.on(PUBLIC.LOBBY_UPDATE, ({ gameId, players }) => {
  showLobby(gameId);
  renderPlayers(players);
});
