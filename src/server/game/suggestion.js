import { ERROR_CODES } from "../../shared/messages.js";
import { GameError } from "../GameError.js";
import { roomLocationId, parseLocationId } from "./board.js";
import { SUSPECT_IDS, WEAPON_IDS, ROOM_IDS } from "./catalog.js";
import { markEliminated } from "./turn.js";
import {
  GAME_PHASE,
  TURN_PHASE,
  isPlayersTurn,
  moveSuspectToRoom,
  finishSuggestion,
  declareWinner,
  declareNoWinner,
} from "./play.js";

/**
 * Suggest a suspect and weapon in the room the player is in.
 * Moves the suspect's token into that room, then finds the first player
 * after the suggester (in turn order) who can disprove it.
 *
 * @returns {{ suggestion, disprover, matchingCardIds }}
 *   disprover is null when no one can disprove.
 */
export function makeSuggestion(game, playerId, { suspectId, weaponId } = {}) {
  requireInProgress(game);
  requireTurn(game, playerId);
  if (game.turnPhase !== TURN_PHASE.AWAITING_SUGGESTION) {
    throw new GameError(ERROR_CODES.ACTION_NOT_ALLOWED, "You can't make a suggestion right now.");
  }
  if (!SUSPECT_IDS.includes(suspectId) || !WEAPON_IDS.includes(weaponId)) {
    throw new GameError(ERROR_CODES.BAD_REQUEST, "Unknown suspect or weapon.");
  }

  const suggester = game.players.get(playerId);
  const roomId = currentRoomId(game, suggester.characterId);
  if (!roomId) {
    throw new GameError(ERROR_CODES.ACTION_NOT_ALLOWED, "You must be in a room to make a suggestion.");
  }

  moveSuspectToRoom(game, suspectId, roomId);

  const suggestion = { suggesterId: playerId, suspectId, weaponId, roomId };
  const { disprover, matchingCardIds } = findDisprover(game, suggestion);

  if (!disprover) {
    finishSuggestion(game); // nobody can disprove: the turn can go on
    return { suggestion, disprover: null, matchingCardIds: [] };
  }

  game.pendingSuggestion = { ...suggestion, askedPlayerId: disprover.id, matchingCardIds };
  game.turnPhase = TURN_PHASE.AWAITING_DISPROVAL;
  game.stateVersion = (game.stateVersion ?? 0) + 1;
  return { suggestion, disprover, matchingCardIds };
}

/**
 * The asked player shows one matching card. Only the suggester sees which card.
 *
 * @returns {{ suggestion, disproverId, card }}
 */
export function submitDisproval(game, playerId, { cardId } = {}) {
  requireInProgress(game);
  const pending = game.pendingSuggestion;
  if (!pending || game.turnPhase !== TURN_PHASE.AWAITING_DISPROVAL) {
    throw new GameError(ERROR_CODES.STALE_SUGGESTION, "There is no suggestion to disprove.");
  }
  if (pending.askedPlayerId !== playerId) {
    throw new GameError(ERROR_CODES.ACTION_NOT_ALLOWED, "You were not asked to disprove this suggestion.");
  }
  if (!pending.matchingCardIds.includes(cardId)) {
    throw new GameError(ERROR_CODES.INVALID_CARD, "Choose one of your cards that matches the suggestion.");
  }

  const card = game.players.get(playerId).hand.find((c) => c.id === cardId);
  const { matchingCardIds, askedPlayerId, ...suggestion } = pending;
  finishSuggestion(game); // clears pendingSuggestion; suggester can accuse or end turn
  return { suggestion, disproverId: playerId, card };
}

/**
 * Accuse a suspect, weapon, and room. Correct: the player wins.
 * Wrong: the player is eliminated (they can still disprove suggestions),
 * their token leaves any hallway, and their turn ends.
 * If everyone is eliminated, the game ends with no winner.
 *
 * @returns {{ correct, solution?, everyoneEliminated }}
 *   solution ({ suspectId, weaponId, roomId }) only when the game ended.
 */
export function makeAccusation(game, playerId, { suspectId, weaponId, roomId } = {}) {
  requireInProgress(game);
  requireTurn(game, playerId);
  if (game.turnPhase === TURN_PHASE.AWAITING_DISPROVAL) {
    throw new GameError(ERROR_CODES.ACTION_NOT_ALLOWED, "Wait for your suggestion to be answered.");
  }
  if (!SUSPECT_IDS.includes(suspectId) || !WEAPON_IDS.includes(weaponId) || !ROOM_IDS.includes(roomId)) {
    throw new GameError(ERROR_CODES.BAD_REQUEST, "Unknown suspect, weapon, or room.");
  }

  const { solution } = game;
  const correct =
    solution.suspect.id === suspectId && solution.weapon.id === weaponId && solution.room.id === roomId;

  if (correct) {
    const won = declareWinner(game, playerId);
    return { correct: true, solution: won.solution, everyoneEliminated: false };
  }

  const player = game.players.get(playerId);
  player.eliminated = true;
  relocateIfInHallway(game, player.characterId);
  markEliminated(game, playerId); // turnOrder copy + passes the turn on
  game.stateVersion = (game.stateVersion ?? 0) + 1;

  if (game.turnOrder.every((entry) => entry.eliminated)) {
    const ended = declareNoWinner(game);
    return { correct: false, solution: ended.solution, everyoneEliminated: true };
  }
  return { correct: false, everyoneEliminated: false };
}

/** First player after the suggester, in turn order, holding a matching card. */
function findDisprover(game, { suggesterId, suspectId, weaponId, roomId }) {
  const order = game.turnOrder.map((entry) => entry.playerId);
  const start = order.indexOf(suggesterId);
  for (let i = 1; i < order.length; i++) {
    const player = game.players.get(order[(start + i) % order.length]);
    // eliminated players still disprove
    const matchingCardIds = (player.hand ?? [])
      .map((c) => c.id)
      .filter((id) => id === suspectId || id === weaponId || id === roomId);
    if (matchingCardIds.length > 0) {
      return { disprover: player, matchingCardIds };
    }
  }
  return { disprover: null, matchingCardIds: [] };
}

/** The room id ("lounge") the character is in, or null if in a hallway. */
function currentRoomId(game, characterId) {
  const location = parseLocationId(game.board.getTokenLocation(characterId) ?? "");
  return location?.kind === "room" ? location.roomId : null;
}

/**
 * An eliminated player's token stays on the board, but it must not block
 * a hallway forever: move it into the alphabetically first adjacent room.
 */
function relocateIfInHallway(game, characterId) {
  const location = parseLocationId(game.board.getTokenLocation(characterId) ?? "");
  if (location?.kind === "hallway") {
    game.board.updatePosition(characterId, roomLocationId(location.roomA));
  }
}

function requireInProgress(game) {
  if (!game?.board || game.phase !== GAME_PHASE.IN_PROGRESS) {
    throw new GameError(ERROR_CODES.ACTION_NOT_ALLOWED, "Game is not in progress.");
  }
}

function requireTurn(game, playerId) {
  if (!isPlayersTurn(game, playerId)) {
    throw new GameError(ERROR_CODES.NOT_YOUR_TURN, "Not your turn.");
  }
}
