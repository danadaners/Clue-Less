/**
 * Identifiers and command names from SRS Appendix B.
 * Canonical ids are the glossary labels in lowercase, with periods removed
 * and spaces replaced by underscores.
 */

export const COMMANDS = Object.freeze({
  SELECT_CHARACTER: 'select_character',
  START_GAME: 'start_game',
  MOVE_PLAYER: 'move_player',
  MAKE_SUGGESTION: 'make_suggestion',
  SUBMIT_DISPROVAL: 'submit_disproval',
  MAKE_ACCUSATION: 'make_accusation',
  END_TURN: 'end_turn',
});

export const SUSPECT_IDS = Object.freeze([
  'miss_scarlet',
  'colonel_mustard',
  'mrs_white',
  'mr_green',
  'mrs_peacock',
  'professor_plum',
]);

export const WEAPON_IDS = Object.freeze([
  'knife',
  'candlestick',
  'revolver',
  'rope',
  'lead_pipe',
  'wrench',
]);

export const ROOM_IDS = Object.freeze([
  'study',
  'hall',
  'lounge',
  'library',
  'billiard_room',
  'dining_room',
  'conservatory',
  'ballroom',
  'kitchen',
]);

export const MOVE_TYPES = Object.freeze(['adjacent', 'secret_passage', 'stay']);

export const ENVELOPE_FIELDS = Object.freeze(['requestId', 'gameId', 'expectedVersion']);

// The server derives these from session and game state. A client payload
// that tries to set them is rejected.
export const SERVER_OWNED_FIELDS = Object.freeze([
  'playerId',
  'activePlayerId',
  'solution',
  'ownHand',
  'hand',
  'turn',
  'stateVersion',
  'characterPositions',
]);

export const SKELETAL_STUB_MESSAGE = 'Not implemented in the skeletal increment.';
