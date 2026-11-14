/**
 * Turn management: order by character (Miss Scarlet first), end-of-turn,
 * skip eliminated. Design Document §3.1 + WBS 5.7.
 */

import { SUSPECT_IDS } from './catalog.js';

/** Top-level game lifecycle (Design Game.phase). */
export const GAME_PHASE = Object.freeze({
  LOBBY: 'LOBBY',
  IN_PROGRESS: 'IN_PROGRESS',
  ENDED: 'ENDED',
});

/**
 * Turn sub-phases used in UC-05 / UC-09 / SRS game_state_update.
 */
export const TURN_PHASE = Object.freeze({
  AWAITING_MOVE: 'awaiting_move',
  AWAITING_SUGGESTION: 'awaiting_suggestion',
  AWAITING_DISPROVAL: 'awaiting_disproval',
  TURN_COMPLETE: 'turn_complete',
});

/**
 * Orders seated players by character, starting with Miss Scarlet.
 * Catalog SUSPECT_IDS order matches Miss Scarlet → … → Professor Plum.
 *
 * @param {Iterable<{ id?: string, playerId?: string, characterId?: string | null, eliminated?: boolean }>} players
 * @returns {{ playerId: string, characterId: string, eliminated: boolean }[]}
 */
export function initializeTurnOrder(players) {
  const seated = [];
  for (const player of players) {
    const characterId = player.characterId;
    if (!characterId || !SUSPECT_IDS.includes(characterId)) {
      continue;
    }
    const playerId = player.playerId ?? player.id;
    if (!playerId) {
      continue;
    }
    seated.push({
      playerId,
      characterId,
      eliminated: Boolean(player.eliminated),
    });
  }

  seated.sort(
    (a, b) => SUSPECT_IDS.indexOf(a.characterId) - SUSPECT_IDS.indexOf(b.characterId),
  );
  return seated;
}

/**
 * @param {{ turnOrder: { playerId: string, eliminated?: boolean }[], currentTurn: number }} game
 * @returns {string | null}
 */
export function getActivePlayerId(game) {
  if (!game?.turnOrder?.length) {
    return null;
  }
  const entry = game.turnOrder[game.currentTurn];
  return entry?.playerId ?? null;
}

/**
 * @param {{ turnOrder: { playerId: string, eliminated?: boolean }[], currentTurn: number }} game
 * @param {string} playerId
 */
export function isPlayersTurn(game, playerId) {
  return getActivePlayerId(game) === playerId;
}

/**
 * Advances to the next non-eliminated player in turnOrder.
 * @param {{ turnOrder: { playerId: string, eliminated?: boolean }[], currentTurn: number, turnPhase?: string, suggestionMovedPlayerId?: string | null, pendingSuggestion?: unknown }} game
 * @param {string} playerId
 * @returns {{ activePlayerId: string, turnPhase: string }}
 */
export function endTurn(game, playerId) {
  if (!game?.turnOrder?.length) {
    throw new Error('Turn order is not initialized.');
  }
  if (getActivePlayerId(game) !== playerId) {
    const err = new Error('Not your turn.');
    err.code = 'NOT_YOUR_TURN';
    throw err;
  }
  if (game.turnPhase === TURN_PHASE.AWAITING_DISPROVAL) {
    const err = new Error('Cannot end turn while a suggestion is unresolved.');
    err.code = 'ACTION_NOT_ALLOWED';
    throw err;
  }

  const n = game.turnOrder.length;
  let next = game.currentTurn;
  for (let i = 0; i < n; i += 1) {
    next = (next + 1) % n;
    if (!game.turnOrder[next].eliminated) {
      game.currentTurn = next;
      game.turnPhase = TURN_PHASE.AWAITING_MOVE;
      game.suggestionMovedPlayerId = null;
      return {
        activePlayerId: game.turnOrder[next].playerId,
        turnPhase: game.turnPhase,
      };
    }
  }

  const err = new Error('No active players remain.');
  err.code = 'GAME_ENDED';
  throw err;
}

/**
 * Marks a player eliminated and, if they were active, advances the turn.
 * Used by accusation flow (Dana); safe for board/turn tests.
 *
 * @param {{ turnOrder: { playerId: string, eliminated?: boolean }[], currentTurn: number, turnPhase?: string }} game
 * @param {string} playerId
 */
export function markEliminated(game, playerId) {
  const index = game.turnOrder.findIndex((p) => p.playerId === playerId);
  if (index < 0) {
    return null;
  }
  game.turnOrder[index].eliminated = true;
  if (game.currentTurn === index) {
    // Re-run endTurn logic without the NOT_YOUR_TURN check by temporarily
    // treating the eliminated player as still "active" for advancement.
    const n = game.turnOrder.length;
    let next = game.currentTurn;
    for (let i = 0; i < n; i += 1) {
      next = (next + 1) % n;
      if (!game.turnOrder[next].eliminated) {
        game.currentTurn = next;
        game.turnPhase = TURN_PHASE.AWAITING_MOVE;
        game.suggestionMovedPlayerId = null;
        return {
          activePlayerId: game.turnOrder[next].playerId,
          turnPhase: game.turnPhase,
        };
      }
    }
  }
  return {
    activePlayerId: getActivePlayerId(game),
    turnPhase: game.turnPhase,
  };
}
