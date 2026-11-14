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
const privateMessageDialog = $("dialog-box")

// Character selection
const characterPicker = $("character-picker");
const characterButtons = $("character-buttons");
const characterError = $("character-error");

const CHARACTER_NAMES = {
  miss_scarlet: "Miss Scarlet",
  colonel_mustard: "Colonel Mustard",
  mrs_white: "Mrs. White",
  mr_green: "Mr. Green",
  mrs_peacock: "Mrs. Peacock",
  professor_plum: "Professor Plum",
};

// Start game (host only) and the placeholder game screen
const lobbyActions = $("lobby-actions");
const startBtn = $("start-btn");
const startHint = $("start-hint");
const homeView = $("home-view");
const nameField = document.querySelector(".name-field");
const boards = document.querySelector(".boards");
const gameView = $("game-view");

let myPlayerId = null;

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

function showDialog(message)
{
  privateMessageDialog.textContent = message;
  privateMessageDialog.show();
  var millisecondsToWait = 3000;
  setTimeout(function() {
      privateMessageDialog.close();
  }, millisecondsToWait);

}

function renderPlayers(players) {
  const gameRow = $("lobby-game-row");
  playerList.replaceChildren(gameRow);
  for (const player of players) {
    const li = document.createElement("li");
    let text = player.isHost ? `${player.displayName} (host)` : player.displayName;
    if (player.characterId) text += ` - ${CHARACTER_NAMES[player.characterId]}`;
    li.textContent = text;
    playerList.appendChild(li);
  }
}

/**
 * One button per character. Characters other players have taken are disabled;
 * your own choice is highlighted.
 */
function renderCharacters(players, availableCharacters) {
  const me = players.find((p) => p.id === myPlayerId);
  characterButtons.replaceChildren();
  for (const [characterId, name] of Object.entries(CHARACTER_NAMES)) {
    const button = document.createElement("button");
    const mine = me?.characterId === characterId;
    button.className = mine ? "btn btn--primary" : "btn";
    button.textContent = name;
    button.disabled = !mine && !availableCharacters.includes(characterId);
    button.addEventListener("click", () => selectCharacter(characterId));
    characterButtons.appendChild(button);
  }
  characterPicker.hidden = false;
}

function selectCharacter(characterId) {
  characterError.textContent = "";
  socket.emit(CLIENT.SELECT_CHARACTER, { characterId }, (res) => {
    if (!res || !res.ok) {
      characterError.textContent = res?.error || "Could not select that character.";
      return;
    }
    console.log(`Client: selected ${CHARACTER_NAMES[res.characterId]}`);
  });
}

/** Only the host sees Start Game; it's enabled once the server says the lobby is ready. */
function renderStartButton(players, canStart) {
  const me = players.find((p) => p.id === myPlayerId);
  if (!me?.isHost) {
    lobbyActions.hidden = true;
    return;
  }
  lobbyActions.hidden = false;
  startBtn.disabled = !canStart;
  startHint.textContent = canStart ? "" : "Waiting for 3-6 players to choose characters.";
}

startBtn.addEventListener("click", () => {
  socket.emit(CLIENT.START_GAME, {}, (res) => {
    if (!res || !res.ok) {
      startHint.textContent = res?.error || "Could not start the game.";
    }
  });
});

/** Placeholder game screen: hides the home and lobby, shows the game view. */
function showGameScreen(gameId, players) {
  homeView.hidden = true;
  nameField.hidden = true;
  boards.hidden = true;
  $("game-view-id").textContent = gameId;
  const list = $("game-player-list");
  list.replaceChildren();
  for (const player of players) {
    const li = document.createElement("li");
    const you = player.id === myPlayerId ? " (you)" : "";
    li.textContent = `${CHARACTER_NAMES[player.characterId]} - ${player.displayName}${you}`;
    list.appendChild(li);
  }
  gameView.hidden = false;
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

    myPlayerId = res.playerId;
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

    myPlayerId = res.playerId;
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

socket.on(PUBLIC.LOBBY_UPDATE, ({ gameId, players, availableCharacters, canStart }) => {
  showLobby(gameId);
  renderPlayers(players);
  renderCharacters(players, availableCharacters);
  renderStartButton(players, canStart);
});

socket.on(PRIVATE.GAME_STARTED, (payload) => {
  console.log(`Client: game ${payload.gameId} started`, payload);
  showGameScreen(payload.gameId, payload.players);
});

socket.on(PRIVATE.MESSAGE, ({message}) => {
  console.log(message)
  showDialog(message);
})