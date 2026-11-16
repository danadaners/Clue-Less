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
const turnStatus = $("turn-status");
const turnActions = $("turn-actions");
const moveActions = $("move-actions");
const endTurnBtn = $("end-turn-btn");
const gameActionError = $("game-action-error");
const positionList = $("position-list");

// Suggestion fields
const suggestPanel = $("suggest-panel");
const suggestBtn = $("suggest-btn");
const disproofOverlay = $("disproof-overlay");
const disproofSubmit = $("disproof-submit");

// Accusation and game over
const accusePanel = $("accuse-panel");
const accuseBtn = $("accuse-btn");
const gameResult = $("game-result");
const eliminationNote = $("elimination-note");

const WEAPON_IDS = ["knife", "candlestick", "revolver", "rope", "lead_pipe", "wrench"];
const ROOM_IDS = [
  "study", "hall", "lounge", "library", "billiard_room",
  "dining_room", "conservatory", "ballroom", "kitchen",
];

let myPlayerId = null;
let gamePlayers = [];
let activePlayerId = null;
let turnPhase = null;
let stateVersion = 0;
let eliminatedPlayerIds = [];
let gameOver = false;


function cardName(card) {
  if (CHARACTER_NAMES[card.id]) return CHARACTER_NAMES[card.id];
  return card.id
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}


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

function joinGame(displayName, gameId)
{
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
  gamePlayers = players;
  renderGamePlayers(players);
  gameView.hidden = false;
}

function renderGamePlayers(players) {
  const list = $("game-player-list");
  list.replaceChildren();
  for (const player of players) {
    const li = document.createElement("li");
    const you = player.id === myPlayerId ? " (you)" : "";
    const active = !gameOver && player.id === activePlayerId ? " — active" : "";
    const out = eliminatedPlayerIds.includes(player.id) ? " (eliminated)" : "";
    li.textContent = `${CHARACTER_NAMES[player.characterId]} - ${player.displayName}${you}${active}${out}`;
    list.appendChild(li);
  }
}

function locationLabel(locationId) {
  if (!locationId) return "(unknown)";
  if (locationId.startsWith("room:")) {
    const id = locationId.slice(5);
    return id.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  }
  if (locationId.startsWith("hallway:")) {
    const parts = locationId.split(":");
    const a = parts[1].split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
    const b = parts[2].split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
    return `Hallway (${a}–${b})`;
  }
  return locationId;
}

function renderPositions(characterPositions) {
  positionList.replaceChildren();
  for (const { characterId, locationId } of characterPositions || []) {
    const li = document.createElement("li");
    li.textContent = `${CHARACTER_NAMES[characterId] || characterId}: ${locationLabel(locationId)}`;
    positionList.appendChild(li);
  }
}

function playerLabel(playerId) {
  const player = gamePlayers.find((p) => p.id === playerId);
  if (!player) return "another player";
  return CHARACTER_NAMES[player.characterId] || player.displayName;
}

function renderTurnStatus() {
  if (gameOver || !activePlayerId) {
    turnStatus.textContent = "";
    return;
  }
  const mine = activePlayerId === myPlayerId;
  const who = mine ? "Your turn" : `${playerLabel(activePlayerId)}'s turn`;
  turnStatus.textContent = `${who} (${turnPhase || "—"})`;
}

function clearMoveUi() {
  moveActions.replaceChildren();
  endTurnBtn.hidden = true;
  accusePanel.hidden = true;
  suggestPanel.hidden = true;
  turnActions.hidden = true;
  gameActionError.textContent = "";
}

function renderMoveUi({ legalMoves = [], canEndTurn = false, canSuggest = false } = {}) {
  const mine = activePlayerId === myPlayerId;
  if (!mine || gameOver) {
    clearMoveUi();
    return;
  }

  turnActions.hidden = false;
  gameActionError.textContent = "";
  moveActions.replaceChildren();

  for (const move of legalMoves) {
    const button = document.createElement("button");
    button.className = "btn";
    if (move.moveType === "stay") {
      button.textContent = "Stay in room";
    } else if (move.moveType === "secret_passage") {
      button.textContent = `Secret passage → ${locationLabel(move.destinationId)}`;
    } else {
      button.textContent = `Move to ${locationLabel(move.destinationId)}`;
    }
    button.addEventListener("click", () => sendMove(move));
    moveActions.appendChild(button);
  }

  suggestPanel.hidden = !canSuggest;
  endTurnBtn.hidden = !canEndTurn;
  // You can accuse any time on your turn, except while waiting for a disproval
  accusePanel.hidden = turnPhase === "awaiting_disproval";
}

function fillSelect(select, ids, label) {
  select.replaceChildren(new Option(`${label}…`, ""));
  for (const id of ids) select.appendChild(new Option(cardName({ id }), id));
}

fillSelect($("accuse-suspect"), Object.keys(CHARACTER_NAMES), "Suspect");
fillSelect($("accuse-weapon"), WEAPON_IDS, "Weapon");
fillSelect($("accuse-room"), ROOM_IDS, "Room");
fillSelect($("suggest-suspect"), Object.keys(CHARACTER_NAMES), "Suspect");
fillSelect($("suggest-weapon"), WEAPON_IDS, "Weapon");


accuseBtn.addEventListener("click", () => {
  const suspectId = $("accuse-suspect").value;
  const weaponId = $("accuse-weapon").value;
  const roomId = $("accuse-room").value;
  if (!suspectId || !weaponId || !roomId) {
    gameActionError.textContent = "Choose a suspect, a weapon, and a room.";
    return;
  }
  gameActionError.textContent = "";
  socket.emit(CLIENT.MAKE_ACCUSATION, { suspectId, weaponId, roomId }, (res) => {
    if (!res || !res.ok) {
      gameActionError.textContent = res?.error || "Could not make the accusation.";
    }
  });
});

suggestBtn.addEventListener("click", () => {
  const suspectId = $("suggest-suspect").value;
  const weaponId = $("suggest-weapon").value;
  if (!suspectId || !weaponId) {
    gameActionError.textContent = "Choose a suspect and a weapon.";
    return;
  }
  gameActionError.textContent = "";
  socket.emit(CLIENT.MAKE_SUGGESTION, { suspectId, weaponId }, (res) => {
    if (!res || !res.ok) {
      gameActionError.textContent = res?.error || "Could not make the suggestion.";
    }
  });
});

disproofSubmit.addEventListener("click", () => {
  const cardId = $("disproof-select").value;
  if (!cardId)
  {
    gameActionError.textContent("Choose a card.");
    return;
  }
  gameActionError.textContent = "";

  socket.emit(CLIENT.SUBMIT_DISPROVAL, {cardId}, (res) => {
    if (!res || !res.ok)
    {
      gameActionError.textContent = res?.error || "Could not submit the disproof.";
    }
  });
  disproofOverlay.close();
  disproofSubmit.disabled = true;
})

/** "Mr. Green with the Rope in the Kitchen" */
function describeSolution({ suspectId, weaponId, roomId }) {
  return `${cardName({ id: suspectId })} with the ${cardName({ id: weaponId })} in the ${cardName({ id: roomId })}`;
}

/** Ends the game on screen: shows the result and removes every turn control. */
function showGameOver({ title, detail, win = false }) {
  gameOver = true;
  clearMoveUi();
  eliminationNote.hidden = true;
  turnStatus.textContent = "";
  $("result-title").textContent = title;
  $("result-detail").textContent = detail;
  gameResult.classList.toggle("game-result--win", win);
  gameResult.hidden = false;
  renderGamePlayers(gamePlayers);
}

function sendMove(move) {
  gameActionError.textContent = "";
  const payload = {
    moveType: move.moveType,
    expectedVersion: stateVersion,
  };
  if (move.destinationId) {
    payload.destinationId = move.destinationId;
  }
  socket.emit(CLIENT.MOVE_PLAYER, payload, (res) => {
    if (!res || !res.ok) {
      gameActionError.textContent = res?.error || "Could not move.";
      return;
    }
    console.log("Client: move accepted", res);
  });
}

endTurnBtn.addEventListener("click", () => {
  gameActionError.textContent = "";
  socket.emit(CLIENT.END_TURN, { expectedVersion: stateVersion }, (res) => {
    if (!res || !res.ok) {
      gameActionError.textContent = res?.error || "Could not end turn.";
      return;
    }
    console.log("Client: end turn accepted", res);
  });
});

function applyPublicState(payload) {
  if (payload.activePlayerId !== undefined) activePlayerId = payload.activePlayerId;
  if (payload.turnPhase !== undefined) turnPhase = payload.turnPhase;
  if (payload.stateVersion !== undefined) stateVersion = payload.stateVersion;
  if (payload.characterPositions) renderPositions(payload.characterPositions);
  if (payload.eliminatedPlayerIds) eliminatedPlayerIds = payload.eliminatedPlayerIds;
  renderTurnStatus();
  renderGamePlayers(gamePlayers);
}

/** Shows this player's own cards, grouped by category. */
function renderHand(hand) {
  const order = ["suspect", "weapon", "room"];
  const sorted = [...hand].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
  const list = $("hand-list");
  list.replaceChildren();
  for (const card of sorted) {
    const li = document.createElement("li");
    li.className = `card card--${card.category}`;
    li.textContent = cardName(card);
    li.title = card.category;
    list.appendChild(li);
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
  joinGame(displayName, gameId);
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
    li.addEventListener("click", () => {
      const displayName = nameInput.value.trim();
      joinGame(displayName, id.textContent);
    });
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
  renderHand(payload.hand);
  applyPublicState(payload);
  clearMoveUi();
});

socket.on(PUBLIC.GAME_STATE_UPDATE, (payload) => {
  console.log("Client: game_state_update", payload);
  applyPublicState(payload);
  if (payload.activePlayerId !== myPlayerId) {
    clearMoveUi();
  }
});

// A wrong accusation: that player is out; the game goes on
socket.on(PUBLIC.ACCUSATION_RESULT, ({ playerId, suspectId, weaponId, roomId }) => {
  const who = playerId === myPlayerId ? "You" : playerLabel(playerId);
  console.log(`Client: ${who} accused ${describeSolution({ suspectId, weaponId, roomId })} and was wrong`);
  if (!eliminatedPlayerIds.includes(playerId)) eliminatedPlayerIds.push(playerId);
  if (playerId === myPlayerId) {
    eliminationNote.hidden = false;
    clearMoveUi();
  }
  renderGamePlayers(gamePlayers);
});

// Win: a correct accusation
socket.on(PUBLIC.GAME_WON, ({ winnerId, solution }) => {
  const youWon = winnerId === myPlayerId;
  showGameOver({
    title: youWon ? "You win!" : `${playerLabel(winnerId)} wins!`,
    detail: `It was ${describeSolution(solution)}.`,
    win: youWon,
  });
});

// Loss for everyone: all players accused wrong
socket.on(PUBLIC.GAME_ENDED_NO_WINNER, ({ solution }) => {
  showGameOver({
    title: "Game over: no one solved the case",
    detail: `It was ${describeSolution(solution)}.`,
  });
});

socket.on(PRIVATE.PLAYER_VIEW_UPDATE, (payload) => {
  console.log("Client: player_view_update", payload);
  applyPublicState(payload);
  renderMoveUi({
    legalMoves: payload.legalMoves || [],
    canEndTurn: Boolean(payload.canEndTurn),
    canSuggest: Boolean(payload.canSuggest)
  });
});

socket.on(PRIVATE.DISPROVAL_REQUEST, (payload) => {
  console.log("Client: disproval_request", payload);
  const list = $("disproof-select");
  list.replaceChildren(payload.matchingCardIds);
  for (const card of payload.matchingCardIds) list.add(new Option(card, card));
  const suspectId = payload.suspectId;
  const weaponId = payload.weaponId;
  const roomId = payload.roomId;
  $("disproof-text").textContent = playerLabel(payload.suggestorId) + " made the suggestion: " + describeSolution({ suspectId, weaponId, roomId}) + ". Select a card to disprove their suggestion. ";
  disproofOverlay.show();
  disproofSubmit.disabled = false;
});

socket.on(PRIVATE.DISPROVAL_RESULT, (payload) =>
{
  console.log("Client: disproval_result", payload);
  showDialog("Your suggestion has been disproven by " + playerLabel(payload.disproverId) + " with their card '" + cardName(payload.card) + "'");
});

socket.on(PRIVATE.MESSAGE, ({message}) => {
  console.log(message)
  showDialog(message);
})