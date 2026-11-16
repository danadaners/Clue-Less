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
const boardGrid = $("board-grid");
const actionLogDialog = $("action-log-dialog");
const actionLogList = $("action-log-list");
const checklistDialog = $("checklist-dialog");
const checklistBody = $("checklist-body");

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

/** Short token labels / colors for the simple board. */
const TOKEN_STYLE = {
  miss_scarlet: { short: "SC", color: "#c41e3a" },
  colonel_mustard: { short: "MU", color: "#c9a227" },
  mrs_white: { short: "WH", color: "#6b7280" },
  mr_green: { short: "GR", color: "#2f6b3a" },
  mrs_peacock: { short: "PE", color: "#3b5bdb" },
  professor_plum: { short: "PL", color: "#6b3fa0" },
};

/** 3x3 rooms with hallway cells between them (locationId or null for empty). */
const BOARD_CELLS = [
  { kind: "room", locationId: "room:study", title: "Study" },
  { kind: "hallway", locationId: "hallway:hall:study", title: "" },
  { kind: "room", locationId: "room:hall", title: "Hall" },
  { kind: "hallway", locationId: "hallway:hall:lounge", title: "" },
  { kind: "room", locationId: "room:lounge", title: "Lounge" },

  { kind: "hallway", locationId: "hallway:library:study", title: "" },
  { kind: "empty", locationId: null, title: "" },
  { kind: "hallway", locationId: "hallway:billiard_room:hall", title: "" },
  { kind: "empty", locationId: null, title: "" },
  { kind: "hallway", locationId: "hallway:dining_room:lounge", title: "" },

  { kind: "room", locationId: "room:library", title: "Library" },
  { kind: "hallway", locationId: "hallway:billiard_room:library", title: "" },
  { kind: "room", locationId: "room:billiard_room", title: "Billiard Room" },
  { kind: "hallway", locationId: "hallway:billiard_room:dining_room", title: "" },
  { kind: "room", locationId: "room:dining_room", title: "Dining Room" },

  { kind: "hallway", locationId: "hallway:conservatory:library", title: "" },
  { kind: "empty", locationId: null, title: "" },
  { kind: "hallway", locationId: "hallway:ballroom:billiard_room", title: "" },
  { kind: "empty", locationId: null, title: "" },
  { kind: "hallway", locationId: "hallway:dining_room:kitchen", title: "" },

  { kind: "room", locationId: "room:conservatory", title: "Conservatory" },
  { kind: "hallway", locationId: "hallway:ballroom:conservatory", title: "" },
  { kind: "room", locationId: "room:ballroom", title: "Ballroom" },
  { kind: "hallway", locationId: "hallway:ballroom:kitchen", title: "" },
  { kind: "room", locationId: "room:kitchen", title: "Kitchen" },
];

/** Outer-corner badge for rooms with a secret passage. */
const SECRET_PASSAGE_CORNER = {
  "room:study": "top-left",
  "room:lounge": "top-right",
  "room:conservatory": "bottom-left",
  "room:kitchen": "bottom-right",
};

let myPlayerId = null;
let gamePlayers = [];
let activePlayerId = null;
let turnPhase = null;
let stateVersion = 0;
let eliminatedPlayerIds = [];
let gameOver = false;
let characterPositions = [];
let legalMoves = [];
let actionLog = [];


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
  $("leave-lobby-btn").hidden = false;
}

/** Return to the home/lobby browser after leaving or a cancelled game. */
function returnHome(message) {
  myPlayerId = null;
  gamePlayers = [];
  activePlayerId = null;
  turnPhase = null;
  stateVersion = 0;
  eliminatedPlayerIds = [];
  gameOver = false;
  characterPositions = [];
  legalMoves = [];
  resetActionLog();
  clearMoveUi();
  gameView.hidden = true;
  gameResult.hidden = true;
  eliminationNote.hidden = true;
  turnStatus.textContent = "";
  $("hand-list").replaceChildren();
  $("game-player-list").replaceChildren();
  characterPicker.hidden = true;
  lobbyActions.hidden = true;
  $("leave-lobby-btn").hidden = true;
  lobbyView.hidden = true;
  homeView.hidden = false;
  nameField.hidden = false;
  boards.hidden = false;
  if (message) {
    showError(message);
  } else {
    clearError();
  }
}

function leaveCurrentGame() {
  socket.emit(CLIENT.LEAVE_GAME, {}, (res) => {
    if (!res || !res.ok) {
      showError(res?.error || "Could not leave the game.");
      return;
    }
    returnHome();
  });
}

function showDialog(message) {
  $("dialog-box-message").textContent = message;
  if (!privateMessageDialog.open) {
    privateMessageDialog.showModal();
  }
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

function renderBoard() {
  const tokensByLocation = new Map();
  for (const { characterId, locationId } of characterPositions || []) {
    if (!tokensByLocation.has(locationId)) tokensByLocation.set(locationId, []);
    tokensByLocation.get(locationId).push(characterId);
  }
  const legalByDestination = new Map(
    (legalMoves || [])
      .filter((m) => m.destinationId)
      .map((m) => [m.destinationId, m]),
  );

  boardGrid.replaceChildren();
  for (const cell of BOARD_CELLS) {
    const el = document.createElement("div");
    if (cell.kind === "empty") {
      el.className = "board-cell board-cell--empty";
      boardGrid.appendChild(el);
      continue;
    }

    el.className = `board-cell board-cell--${cell.kind}`;
    el.dataset.locationId = cell.locationId;

    const secretCorner = SECRET_PASSAGE_CORNER[cell.locationId];
    if (secretCorner) {
      const badge = document.createElement("span");
      badge.className = `secret-badge secret-badge--${secretCorner}`;
      badge.textContent = "secret";
      badge.title = "Secret passage";
      el.appendChild(badge);
    }

    const title = document.createElement("div");
    title.className = "board-cell-title";
    title.textContent = cell.kind === "room" ? cell.title : "·";
    el.appendChild(title);

    const tokens = document.createElement("div");
    tokens.className = "board-tokens";
    for (const characterId of tokensByLocation.get(cell.locationId) || []) {
      const style = TOKEN_STYLE[characterId] || { short: "?", color: "#444" };
      const token = document.createElement("span");
      token.className = "token";
      token.textContent = style.short;
      token.title = CHARACTER_NAMES[characterId] || characterId;
      token.style.background = style.color;
      tokens.appendChild(token);
    }
    el.appendChild(tokens);

    const move = legalByDestination.get(cell.locationId);
    if (move && !gameOver) {
      el.classList.add("board-cell--legal");
      el.title = `Move to ${locationLabel(cell.locationId)}`;
      el.addEventListener("click", () => sendMove(move));
    }

    boardGrid.appendChild(el);
  }
}

function appendActionLog(message) {
  if (!message) return;
  actionLog.push(message);
  const li = document.createElement("li");
  li.textContent = message;
  actionLogList.appendChild(li);
  actionLogList.parentElement.scrollTop = actionLogList.parentElement.scrollHeight;
}

function resetActionLog() {
  actionLog = [];
  actionLogList.replaceChildren();
}

function buildChecklist() {
  checklistBody.replaceChildren();
  const sections = [
    ["Who", Object.keys(CHARACTER_NAMES)],
    ["What", WEAPON_IDS],
    ["Where", ROOM_IDS],
  ];
  for (const [heading, ids] of sections) {
    const section = document.createElement("div");
    section.className = "checklist-section";
    const h4 = document.createElement("h4");
    h4.textContent = heading;
    section.appendChild(h4);
    for (const id of ids) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.checklistId = id;
      label.append(input, document.createTextNode(cardName({ id })));
      section.appendChild(label);
    }
    checklistBody.appendChild(section);
  }
}

function logPublicAction(payload) {
  const action = payload?.lastAction;
  if (!action?.kind) return;
  if (action.kind === "move") {
    appendActionLog(
      `${playerLabel(action.playerId)} moved to ${locationLabel(action.destinationId)}.`,
    );
  } else if (action.kind === "turn") {
    appendActionLog(
      `${playerLabel(action.playerId)} ended their turn` +
        (action.activePlayerId ? ` — now ${playerLabel(action.activePlayerId)}.` : "."),
    );
  } else if (action.kind === "suggestion") {
    appendActionLog(
      `${playerLabel(action.suggesterId)} suggested ${describeSolution({
        suspectId: action.suspectId,
        weaponId: action.weaponId,
        roomId: action.roomId,
      })}.`,
    );
  }
  // Wrong accusations are logged from ACCUSATION_RESULT (includes the claim).
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
  legalMoves = [];
  if (boardGrid) renderBoard();
}

function renderMoveUi({ legalMoves: moves = [], canEndTurn = false, canSuggest = false } = {}) {
  legalMoves = moves;
  renderBoard();

  const mine = activePlayerId === myPlayerId;
  if (!mine || gameOver) {
    clearMoveUi();
    return;
  }

  turnActions.hidden = false;
  gameActionError.textContent = "";
  moveActions.replaceChildren();

  // Board clicks handle adjacent/secret destinations; keep buttons for stay
  // and as a backup list for hallways/rooms.
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
  if (!cardId) {
    gameActionError.textContent = "Choose a card.";
    return;
  }
  gameActionError.textContent = "";

  socket.emit(CLIENT.SUBMIT_DISPROVAL, { cardId }, (res) => {
    if (!res || !res.ok) {
      gameActionError.textContent = res?.error || "Could not submit the disproof.";
      return;
    }
    disproofOverlay.close();
    disproofSubmit.disabled = true;
  });
});

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
  if (payload.characterPositions) {
    characterPositions = payload.characterPositions;
    renderBoard();
  }
  if (payload.eliminatedPlayerIds) eliminatedPlayerIds = payload.eliminatedPlayerIds;
  renderTurnStatus();
  renderGamePlayers(gamePlayers);
}

$("open-action-log").addEventListener("click", () => actionLogDialog.showModal());
$("close-action-log").addEventListener("click", () => actionLogDialog.close());
$("open-checklist").addEventListener("click", () => checklistDialog.showModal());
$("close-checklist").addEventListener("click", () => checklistDialog.close());
$("leave-lobby-btn").addEventListener("click", leaveCurrentGame);
$("leave-game-btn").addEventListener("click", leaveCurrentGame);
$("dialog-box-close").addEventListener("click", () => privateMessageDialog.close());

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
  resetActionLog();
  buildChecklist();
  legalMoves = [];
  $("leave-lobby-btn").hidden = true;
  showGameScreen(payload.gameId, payload.players);
  renderHand(payload.hand);
  applyPublicState(payload);
  clearMoveUi();
  appendActionLog("Game started.");
});

socket.on(PUBLIC.GAME_CANCELLED_DISCONNECT, ({ displayName, reason }) => {
  const why = reason === "disconnected" ? "disconnected" : "left";
  returnHome(
    `Game cancelled because ${displayName || "a player"} ${why}.`,
  );
});

socket.on(PUBLIC.GAME_STATE_UPDATE, (payload) => {
  console.log("Client: game_state_update", payload);
  applyPublicState(payload);
  logPublicAction(payload);
  if (payload.activePlayerId !== myPlayerId) {
    legalMoves = [];
    renderBoard();
    clearMoveUi();
  }
});

// A wrong accusation: that player is out; the game goes on
socket.on(PUBLIC.ACCUSATION_RESULT, ({ playerId, suspectId, weaponId, roomId }) => {
  const who = playerId === myPlayerId ? "You" : playerLabel(playerId);
  console.log(`Client: ${who} accused ${describeSolution({ suspectId, weaponId, roomId })} and was wrong`);
  appendActionLog(
    `${playerLabel(playerId)} accused ${describeSolution({ suspectId, weaponId, roomId })} and was wrong.`,
  );
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
  appendActionLog(
    `${playerLabel(winnerId)} won. It was ${describeSolution(solution)}.`,
  );
  showGameOver({
    title: youWon ? "You win!" : `${playerLabel(winnerId)} wins!`,
    detail: `It was ${describeSolution(solution)}.`,
    win: youWon,
  });
});

// Loss for everyone: all players accused wrong
socket.on(PUBLIC.GAME_ENDED_NO_WINNER, ({ solution }) => {
  appendActionLog(`Game ended with no winner. It was ${describeSolution(solution)}.`);
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
    canSuggest: Boolean(payload.canSuggest),
  });
});

socket.on(PRIVATE.DISPROVAL_REQUEST, (payload) => {
  console.log("Client: disproval_request", payload);
  const list = $("disproof-select");
  list.replaceChildren();
  for (const card of payload.matchingCardIds || []) {
    list.add(new Option(cardName({ id: card }), card));
  }
  const suspectId = payload.suspectId;
  const weaponId = payload.weaponId;
  const roomId = payload.roomId;
  const suggesterId = payload.suggesterId || payload.suggestorId;
  $("disproof-text").textContent =
    `${playerLabel(suggesterId)} made the suggestion: ` +
    `${describeSolution({ suspectId, weaponId, roomId })}. ` +
    "Select a card to disprove their suggestion.";
  disproofOverlay.show();
  disproofSubmit.disabled = false;
});

socket.on(PUBLIC.DISPROVAL_PUBLIC, ({ suggesterId, disproverId }) => {
  if (!disproverId) {
    appendActionLog(`${playerLabel(suggesterId)}'s suggestion could not be disproved.`);
    return;
  }
  appendActionLog(
    `${playerLabel(disproverId)} showed a card to ${playerLabel(suggesterId)}.`,
  );
});

socket.on(PRIVATE.DISPROVAL_RESULT, (payload) => {
  console.log("Client: disproval_result", payload);
  showDialog(
    "Your suggestion has been disproven by " +
      playerLabel(payload.disproverId) +
      " with their card '" +
      cardName(payload.card) +
      "'",
  );
});

socket.on(PRIVATE.MESSAGE, ({ message }) => {
  console.log(message);
  showDialog(message);
});

buildChecklist();
renderBoard();