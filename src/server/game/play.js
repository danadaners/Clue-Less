/**
 * In-progress play helpers: start board + turns, move players, and the
 * thin suggestion hooks Dana calls while working in parallel (5.5).
 */

import { ERROR_CODES } from '../../shared/messages.js';
import { GameError } from '../GameError.js';
import { Board, roomLocationId } from './board.js';
import { ROOM_IDS } from './catalog.js';
import {
  GAME_PHASE,
  TURN_PHASE,
  endTurn as advanceTurn,
  getActivePlayerId,
  initializeTurnOrder,
  isPlayersTurn,
} from './turn.js';

/**
 * Attaches Board, turn order, and play fields to a Communication game object
 * after lobby start checks pass. Places all six tokens; seats only players
 * who have a characterId.
 *
 * @param {object} game
 * @param {Iterable<object>} [players] defaults to game.players values
 */
export function beginPlay(game, players) {
  const list =
    players ??
    (game.players instanceof Map ? [...game.players.values()] : game.players);

  for (const player of list) {
    if (player && player.eliminated === undefined) {
      player.eliminated = false;
    }
    if (player) {
      player.movedBySuggestion = false;
    }
  }

  const board = new Board();
  board.placeTokens();

  const turnOrder = initializeTurnOrder(list);
  if (turnOrder.length === 0) {
    throw new GameError(
      ERROR_CODES.START_NOT_READY,
      'At least one player must have a character selected.',
    );
  }

  game.board = board;
  game.turnOrder = turnOrder;
  game.currentTurn = 0;
  game.phase = GAME_PHASE.IN_PROGRESS;
  game.turnPhase = TURN_PHASE.AWAITING_MOVE;
  game.pendingSuggestion = null;
  game.stateVersion = (game.stateVersion ?? 0) + 1;

  return {
    activePlayerId: turnOrder[0].playerId,
    turnPhase: game.turnPhase,
    characterPositions: board.getCharacterPositions(),
    turnOrder: turnOrder.map(({ playerId, characterId }) => ({
      playerId,
      characterId,
    })),
  };
}

/**
 * Design §3.1 movePlayer + UC-05 phase outcomes.
 *
 * @param {object} game
 * @param {string} playerId
 * @param {{ moveType: string, destinationId?: string }} move
 */
export function movePlayer(game, playerId, { moveType, destinationId } = {}) {
  requireInProgress(game);
  if (!isPlayersTurn(game, playerId)) {
    throw new GameError(ERROR_CODES.NOT_YOUR_TURN, 'Not your turn.');
  }
  if (game.turnPhase !== TURN_PHASE.AWAITING_MOVE) {
    throw new GameError(
      ERROR_CODES.ACTION_NOT_ALLOWED,
      'A move is not allowed in the current turn phase.',
    );
  }

  const characterId = characterIdForPlayer(game, playerId);
  if (!characterId) {
    throw new GameError(
      ERROR_CODES.ACTION_NOT_ALLOWED,
      'Player has no character on the board.',
    );
  }

  if (moveType === 'stay') {
    if (!playerById(game, playerId)?.movedBySuggestion) {
      throw new GameError(
        ERROR_CODES.ACTION_NOT_ALLOWED,
        'stay is only allowed after being moved by a suggestion.',
      );
    }
    if (destinationId !== undefined) {
      throw new GameError(
        ERROR_CODES.BAD_REQUEST,
        'destinationId is only allowed for adjacent and secret_passage moves.',
      );
    }
    if (!game.board.isLegalMove(characterId, 'stay', undefined)) {
      throw new GameError(ERROR_CODES.ACTION_NOT_ALLOWED, 'stay is not legal here.');
    }
    game.turnPhase = TURN_PHASE.AWAITING_SUGGESTION;
    playerById(game, playerId).movedBySuggestion = false;
    game.stateVersion = (game.stateVersion ?? 0) + 1;
    return {
      characterPositions: game.board.getCharacterPositions(),
      turnPhase: game.turnPhase,
      activePlayerId: getActivePlayerId(game),
    };
  }

  if (!game.board.isLegalMove(characterId, moveType, destinationId)) {
    throw new GameError(ERROR_CODES.ACTION_NOT_ALLOWED, 'That move is not legal.');
  }

  const characterPositions = game.board.updatePosition(characterId, destinationId);
  if (game.board.isRoom(destinationId)) {
    game.turnPhase = TURN_PHASE.AWAITING_SUGGESTION;
  } else {
    game.turnPhase = TURN_PHASE.TURN_COMPLETE;
  }
  // This player has now taken their move, so the "may stay" option is used up
  const mover = playerById(game, playerId);
  if (mover) {
    mover.movedBySuggestion = false;
  }
  game.stateVersion = (game.stateVersion ?? 0) + 1;

  return {
    characterPositions,
    turnPhase: game.turnPhase,
    activePlayerId: getActivePlayerId(game),
    fromLocationId: undefined,
    toLocationId: destinationId,
  };
}

/**
 * Ends the active player's turn and skips eliminated players.
 * Allowed after a move finishes (hallway → turn_complete, or room →
 * awaiting_suggestion until suggestion/accusation exist).
 *
 * @param {object} game
 * @param {string} playerId
 */
export function endTurn(game, playerId) {
  requireInProgress(game);
  if (!isPlayersTurn(game, playerId)) {
    throw new GameError(ERROR_CODES.NOT_YOUR_TURN, 'Not your turn.');
  }
  if (!canEndTurn(game, playerId)) {
    throw new GameError(
      ERROR_CODES.ACTION_NOT_ALLOWED,
      'End turn is only allowed after you have moved.',
    );
  }
  try {
    const result = advanceTurn(game, playerId);
    game.stateVersion = (game.stateVersion ?? 0) + 1;
    return result;
  } catch (err) {
    const code = err.code || ERROR_CODES.ACTION_NOT_ALLOWED;
    throw new GameError(code, err.message);
  }
}

/**
 * Legal moves for the active player (for the client move UI).
 *
 * @param {object} game
 * @param {string} playerId
 */
export function listLegalMovesForPlayer(game, playerId) {
  requireInProgress(game);
  const characterId = characterIdForPlayer(game, playerId);
  if (!characterId) {
    return [];
  }
  const moves = game.board.listLegalMoves(characterId);
  if (
    playerById(game, playerId)?.movedBySuggestion &&
    game.board.isLegalMove(characterId, 'stay', undefined)
  ) {
    moves.push({ moveType: 'stay' });
  }
  return moves;
}

/**
 * Dana suggestion hook: move a suspect token into a room.
 * Marks the controlling player (if any) as suggestion-moved so they may stay.
 *
 * @param {object} game
 * @param {string} characterId
 * @param {string} roomId room glossary id, e.g. "lounge"
 */
export function moveSuspectToRoom(game, characterId, roomId) {
  requireInProgress(game);
  if (!ROOM_IDS.includes(roomId)) {
    throw new GameError(ERROR_CODES.BAD_REQUEST, 'roomId is not a recognized id.');
  }
  const destinationId = roomLocationId(roomId);
  const characterPositions = game.board.updatePosition(characterId, destinationId);

  const controlling = game.turnOrder?.find((p) => p.characterId === characterId);
  if (controlling && controlling.playerId !== getActivePlayerId(game)) {
    // Kept until that player's next move, so they can choose to stay and suggest
    const moved = playerById(game, controlling.playerId);
    if (moved) {
      moved.movedBySuggestion = true;
    }
  }

  game.stateVersion = (game.stateVersion ?? 0) + 1;
  return { characterPositions, destinationId };
}

/**
 * Dana suggestion hook: clear pending suggestion so the active player can
 * continue (accuse / end turn). Design equivalent: pendingSuggestion = null.
 *
 * @param {object} game
 */
export function finishSuggestion(game) {
  requireInProgress(game);
  game.pendingSuggestion = null;
  if (game.turnPhase === TURN_PHASE.AWAITING_DISPROVAL) {
    game.turnPhase = TURN_PHASE.TURN_COMPLETE;
  } else if (game.turnPhase === TURN_PHASE.AWAITING_SUGGESTION) {
    // Suggestion resolved without needing further move; player may end turn.
    game.turnPhase = TURN_PHASE.TURN_COMPLETE;
  }
  game.stateVersion = (game.stateVersion ?? 0) + 1;
  return {
    turnPhase: game.turnPhase,
    activePlayerId: getActivePlayerId(game),
  };
}

/**
 * Ends the game with a winner (correct accusation). Call from accusation flow.
 *
 * @param {object} game
 * @param {string} playerId
 */
export function declareWinner(game, playerId) {
  if (!game) {
    throw new GameError(ERROR_CODES.ACTION_NOT_ALLOWED, 'Game is missing.');
  }
  game.phase = GAME_PHASE.ENDED;
  game.winnerPlayerId = playerId;
  game.endReason = 'accusation_correct';
  game.pendingSuggestion = null;
  game.stateVersion = (game.stateVersion ?? 0) + 1;
  return {
    winnerPlayerId: playerId,
    solution: publicSolution(game.solution),
    stateVersion: game.stateVersion,
  };
}

/**
 * Ends the game with no winner (e.g. every player eliminated).
 *
 * @param {object} game
 * @param {string} [reason]
 */
export function declareNoWinner(game, reason = 'all_players_eliminated') {
  if (!game) {
    throw new GameError(ERROR_CODES.ACTION_NOT_ALLOWED, 'Game is missing.');
  }
  game.phase = GAME_PHASE.ENDED;
  game.winnerPlayerId = null;
  game.endReason = reason;
  game.pendingSuggestion = null;
  game.stateVersion = (game.stateVersion ?? 0) + 1;
  return {
    reason,
    solution: publicSolution(game.solution),
    stateVersion: game.stateVersion,
  };
}

/**
 * @param {object | undefined} solution
 */
function publicSolution(solution) {
  if (!solution) {
    return null;
  }
  return {
    suspectId: solution.suspect?.id ?? solution.suspectId ?? null,
    weaponId: solution.weapon?.id ?? solution.weaponId ?? null,
    roomId: solution.room?.id ?? solution.roomId ?? null,
  };
}

/**
 * True when the active player may end their turn: after moving, or when
 * they are blocked (no legal move), in which case they lose their move.
 *
 * @param {object} game
 * @param {string} playerId
 */
export function canEndTurn(game, playerId) {
  if (!isPlayersTurn(game, playerId)) {
    return false;
  }
  if (
    game.turnPhase === TURN_PHASE.TURN_COMPLETE ||
    game.turnPhase === TURN_PHASE.AWAITING_SUGGESTION
  ) {
    return true;
  }
  return (
    game.turnPhase === TURN_PHASE.AWAITING_MOVE &&
    listLegalMovesForPlayer(game, playerId).length === 0
  );
}

/**
 * @param {object} game
 * @param {string} playerId
 */
function playerById(game, playerId) {
  if (game.players instanceof Map) {
    return game.players.get(playerId) ?? null;
  }
  return (game.players ?? []).find((p) => (p.id ?? p.playerId) === playerId) ?? null;
}

/**
 * @param {object} game
 * @param {string} playerId
 */
function characterIdForPlayer(game, playerId) {
  const fromOrder = game.turnOrder?.find((p) => p.playerId === playerId);
  if (fromOrder) {
    return fromOrder.characterId;
  }
  if (game.players instanceof Map) {
    const player = game.players.get(playerId);
    return player?.characterId ?? null;
  }
  return null;
}

function requireInProgress(game) {
  if (!game?.board || game.phase !== GAME_PHASE.IN_PROGRESS) {
    throw new GameError(
      ERROR_CODES.ACTION_NOT_ALLOWED,
      'Game is not in progress.',
    );
  }
}

export {
  getActivePlayerId,
  isPlayersTurn,
  GAME_PHASE,
  TURN_PHASE,
  initializeTurnOrder,
};