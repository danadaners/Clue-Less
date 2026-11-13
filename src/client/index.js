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

socket.on(PUBLIC.LOBBY_UPDATE, ({ gameId, players, availableCharacters }) => {
  showLobby(gameId);
  renderPlayers(players);
  renderCharacters(players, availableCharacters);
});

socket.on(PRIVATE.MESSAGE, ({message}) => {
  console.log(message)
  showDialog(message);
})