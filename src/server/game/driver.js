/**
 * Temporary driver for the skeletal Game Logic stub.
 * Run: node src/server/game/driver.js
 */

import assert from 'node:assert/strict';
import { assessAction, COMMANDS } from './assessAction.js';

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
