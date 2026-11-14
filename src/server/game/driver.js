/**
 * Driver for Game Logic: payload validation stubs plus board / movement / turns.
 * Run: node src/server/game/driver.js
 */

import assert from 'node:assert/strict';
import { assessAction, COMMANDS } from './assessAction.js';
import {
  Board,
  START_POSITIONS,
  hallwayId,
  roomLocationId,
  SECRET_PASSAGES,
} from './board.js';
import {
  beginPlay,
  endTurn,
  finishSuggestion,
  movePlayer,
  moveSuspectToRoom,
} from './play.js';
import { TURN_PHASE } from './turn.js';

const actor = { playerId: 'player-1', gameId: 'GAME' };

function envelope(extra = {}) {
  return {
    requestId: 'req-1',
    gameId: 'GAME',
    expectedVersion: 0,
    ...extra,
  };
}

function assess(eventName, payload, actorOverride = actor) {
  return assessAction({
    actor: actorOverride,
    eventName,
    payload,
  });
}

const checks = [];

function check(name, fn) {
  checks.push({ name, fn });
}

check('create_game is left to Session and Communication', () => {
  const result = assess('create_game', { displayName: 'Dana' });
  assert.deepEqual(result, { handled: false });
});

check('a missing actor is unauthorized', () => {
  const result = assess(COMMANDS.END_TURN, envelope(), null);
  assert.equal(result.handled, true);
  assert.equal(result.accepted, false);
  assert.equal(result.error.code, 'UNAUTHORIZED');
});

check('a missing requestId is a bad request', () => {
  const payload = envelope();
  delete payload.requestId;
  const result = assess(COMMANDS.END_TURN, payload);
  assert.equal(result.error.code, 'BAD_REQUEST');
  assert.equal(result.error.message, 'requestId is required.');
});

check('a well-formed end_turn is refused without effects', () => {
  const payload = envelope();
  const before = { ...payload };
  const result = assess(COMMANDS.END_TURN, payload);
  assert.deepEqual(payload, before);
  assert.equal(result.accepted, false);
  assert.deepEqual(result.effects, []);
  assert.equal(result.error.code, 'ACTION_NOT_ALLOWED');
  assert.equal(result.error.message, 'Not implemented in the skeletal increment.');
  assert.equal(result.error.requestId, 'req-1');
});

check('select_character rejects an unknown suspect', () => {
  const result = assess(COMMANDS.SELECT_CHARACTER, envelope({ characterId: 'sherlock' }));
  assert.equal(result.error.code, 'BAD_REQUEST');
  assert.equal(result.error.message, 'characterId is not a recognized id.');
});

check('select_character accepts a canonical suspect and stays a stub', () => {
  const result = assess(COMMANDS.SELECT_CHARACTER, envelope({ characterId: 'professor_plum' }));
  assert.equal(result.error.code, 'ACTION_NOT_ALLOWED');
});

check('start_game rejects a client-supplied solution', () => {
  const result = assess(COMMANDS.START_GAME, envelope({ solution: { roomId: 'study' } }));
  assert.equal(result.error.message, 'solution is decided by the server, not the client.');
});

check('an adjacent move to a room is a stub', () => {
  const result = assess(COMMANDS.MOVE_PLAYER, envelope({ moveType: 'adjacent', destinationId: 'room:kitchen' }));
  assert.equal(result.error.code, 'ACTION_NOT_ALLOWED');
});

check('a hallway id must list its rooms in alphabetical order', () => {
  const result = assess(COMMANDS.MOVE_PLAYER, envelope({ moveType: 'adjacent', destinationId: 'hallway:study:hall' }));
  assert.equal(result.error.message, 'destinationId is not a recognized location.');
});

check('stay cannot include a destination', () => {
  const result = assess(COMMANDS.MOVE_PLAYER, envelope({ moveType: 'stay', destinationId: 'room:hall' }));
  assert.equal(result.error.message, 'destinationId is only allowed for adjacent and secret_passage moves.');
});

check('a suggestion cannot name the room', () => {
  const result = assess(COMMANDS.MAKE_SUGGESTION, envelope({ suspectId: 'miss_scarlet', weaponId: 'rope', roomId: 'hall' }));
  assert.equal(result.error.message, "roomId is supplied by the server from the player's current room.");
});

check('a well-formed suggestion is a stub', () => {
  const result = assess(COMMANDS.MAKE_SUGGESTION, envelope({ suspectId: 'miss_scarlet', weaponId: 'lead_pipe' }));
  assert.equal(result.error.code, 'ACTION_NOT_ALLOWED');
});

check('disproval requires a category:id card', () => {
  const result = assess(COMMANDS.SUBMIT_DISPROVAL, envelope({ suggestionId: 'sug-1', cardId: 'rope' }));
  assert.equal(result.error.message, 'cardId is not a recognized id.');
});

check('a well-formed disproval is a stub', () => {
  const result = assess(COMMANDS.SUBMIT_DISPROVAL, envelope({ suggestionId: 'sug-1', cardId: 'weapon:rope' }));
  assert.equal(result.error.code, 'ACTION_NOT_ALLOWED');
});

check('an accusation needs a suspect, weapon, and room', () => {
  const result = assess(COMMANDS.MAKE_ACCUSATION, envelope({ suspectId: 'mr_green', weaponId: 'wrench' }));
  assert.equal(result.error.message, 'roomId is required.');
});

check('a well-formed accusation is a stub and does not reveal a solution', () => {
  const result = assess(COMMANDS.MAKE_ACCUSATION, envelope({ suspectId: 'mr_green', weaponId: 'wrench', roomId: 'study' }));
  assert.equal(result.accepted, false);
  assert.equal(result.error.code, 'ACTION_NOT_ALLOWED');
  assert.equal(result.error.solution, undefined);
});

check('the actor gameId must match the payload', () => {
  const result = assess(COMMANDS.END_TURN, envelope(), { playerId: 'player-1', gameId: 'OTHER' });
  assert.equal(result.error.message, 'payload gameId does not match the authenticated actor.');
});

function sampleGame() {
  const players = [
    { id: 'p-scarlet', displayName: 'A', characterId: 'miss_scarlet' },
    { id: 'p-mustard', displayName: 'B', characterId: 'colonel_mustard' },
    { id: 'p-plum', displayName: 'C', characterId: 'professor_plum' },
  ];
  const game = { players: new Map(players.map((p) => [p.id, p])) };
  beginPlay(game);
  return game;
}

check('board has 21 locations and places six start hallways', () => {
  const board = new Board();
  assert.equal(board.locationCount, 21);
  board.placeTokens();
  for (const [characterId, locationId] of Object.entries(START_POSITIONS)) {
    assert.equal(board.getTokenLocation(characterId), locationId);
  }
  assert.equal(board.getCharacterPositions().length, 6);
});

check('secret passages link study-kitchen and lounge-conservatory', () => {
  const board = new Board();
  for (const [a, b] of SECRET_PASSAGES) {
    const roomA = board.getLocation(roomLocationId(a));
    const roomB = board.getLocation(roomLocationId(b));
    assert.equal(roomA.secretPassage, roomB);
    assert.equal(roomB.secretPassage, roomA);
  }
});

check('hallway capacity blocks a second token', () => {
  const board = new Board();
  board.placeTokens();
  // Scarlet still occupies hall-lounge. Put Mustard in the Lounge so the
  // hallway is adjacent, then capacity must block entry.
  board.updatePosition('colonel_mustard', roomLocationId('lounge'));
  assert.equal(
    board.isLegalMove(
      'colonel_mustard',
      'adjacent',
      hallwayId('hall', 'lounge'),
    ),
    false,
  );
  // Vacate the hallway; Mustard can enter.
  board.updatePosition('miss_scarlet', roomLocationId('hall'));
  assert.equal(
    board.isLegalMove(
      'colonel_mustard',
      'adjacent',
      hallwayId('hall', 'lounge'),
    ),
    true,
  );
});

check('turn order starts with Miss Scarlet then Mustard', () => {
  const game = sampleGame();
  assert.deepEqual(
    game.turnOrder.map((p) => p.characterId),
    ['miss_scarlet', 'colonel_mustard', 'professor_plum'],
  );
  assert.equal(game.turnOrder[0].playerId, 'p-scarlet');
  assert.equal(game.turnPhase, TURN_PHASE.AWAITING_MOVE);
});

check('adjacent move into a room enters awaiting_suggestion', () => {
  const game = sampleGame();
  // Scarlet starts in hall-lounge; can enter lounge or hall.
  const result = movePlayer(game, 'p-scarlet', {
    moveType: 'adjacent',
    destinationId: roomLocationId('lounge'),
  });
  assert.equal(result.turnPhase, TURN_PHASE.AWAITING_SUGGESTION);
  assert.equal(game.board.getTokenLocation('miss_scarlet'), roomLocationId('lounge'));
});

check('adjacent move into a hallway enters turn_complete', () => {
  const game = sampleGame();
  movePlayer(game, 'p-scarlet', {
    moveType: 'adjacent',
    destinationId: roomLocationId('lounge'),
  });
  // Force Scarlet back to a room with a free exit for a hallway test via updatePosition.
  // Put Scarlet in study (empty), then move to study-hall hallway.
  game.board.updatePosition('miss_scarlet', roomLocationId('study'));
  game.turnPhase = TURN_PHASE.AWAITING_MOVE;
  const result = movePlayer(game, 'p-scarlet', {
    moveType: 'adjacent',
    destinationId: hallwayId('hall', 'study'),
  });
  assert.equal(result.turnPhase, TURN_PHASE.TURN_COMPLETE);
});

check('secret passage from study to kitchen is legal', () => {
  const game = sampleGame();
  game.board.updatePosition('miss_scarlet', roomLocationId('study'));
  assert.equal(
    game.board.isLegalMove(
      'miss_scarlet',
      'secret_passage',
      roomLocationId('kitchen'),
    ),
    true,
  );
  const result = movePlayer(game, 'p-scarlet', {
    moveType: 'secret_passage',
    destinationId: roomLocationId('kitchen'),
  });
  assert.equal(result.turnPhase, TURN_PHASE.AWAITING_SUGGESTION);
});

check('endTurn skips an eliminated player', () => {
  const game = sampleGame();
  // Scarlet ends without moving by forcing turn_complete.
  game.turnPhase = TURN_PHASE.TURN_COMPLETE;
  game.turnOrder[1].eliminated = true; // Mustard out
  const result = endTurn(game, 'p-scarlet');
  assert.equal(result.activePlayerId, 'p-plum');
  assert.equal(result.turnPhase, TURN_PHASE.AWAITING_MOVE);
});

check('moveSuspectToRoom and finishSuggestion update phase', () => {
  const game = sampleGame();
  movePlayer(game, 'p-scarlet', {
    moveType: 'adjacent',
    destinationId: roomLocationId('lounge'),
  });
  game.turnPhase = TURN_PHASE.AWAITING_DISPROVAL;
  game.pendingSuggestion = { suggestionId: 'sug-1' };

  const moved = moveSuspectToRoom(game, 'professor_plum', 'lounge');
  assert.equal(moved.destinationId, roomLocationId('lounge'));
  assert.equal(game.board.getTokenLocation('professor_plum'), roomLocationId('lounge'));
  assert.equal(game.suggestionMovedPlayerId, 'p-plum');

  const finished = finishSuggestion(game);
  assert.equal(game.pendingSuggestion, null);
  assert.equal(finished.turnPhase, TURN_PHASE.TURN_COMPLETE);
});

check('assessAction applies move_player when a game is supplied', () => {
  const game = sampleGame();
  const result = assessAction({
    actor: { playerId: 'p-scarlet', gameId: 'GAME' },
    eventName: COMMANDS.MOVE_PLAYER,
    payload: envelope({
      moveType: 'adjacent',
      destinationId: roomLocationId('hall'),
    }),
    game,
  });
  assert.equal(result.accepted, true);
  assert.equal(result.result.turnPhase, TURN_PHASE.AWAITING_SUGGESTION);
});

check('assessAction applies end_turn when a game is supplied', () => {
  const game = sampleGame();
  game.turnPhase = TURN_PHASE.TURN_COMPLETE;
  const result = assessAction({
    actor: { playerId: 'p-scarlet', gameId: 'GAME' },
    eventName: COMMANDS.END_TURN,
    payload: envelope(),
    game,
  });
  assert.equal(result.accepted, true);
  assert.equal(result.result.activePlayerId, 'p-mustard');
});

let failed = 0;
for (const { name, fn } of checks) {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(error);
  }
}

if (failed > 0) {
  console.error(`${failed} check(s) failed.`);
  process.exit(1);
}

console.log(`${checks.length} checks passed.`);
