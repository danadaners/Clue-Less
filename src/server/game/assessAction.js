/**
 * Game Logic action assessment (SRS Appendix B.6).
 *
 * Communication will call this with an authenticated actor, an event name,
 * and the request payload. This skeletal version checks that interface and
 * then refuses the action. It does not change game state. The Minimal
 * increment replaces the refusal with the real rules.
 *
 * This folder is an ES module so Communication can import it. The server
 * entry on this branch still uses require, so the module flag lives here.
 */

import {
  COMMANDS,
  SUSPECT_IDS,
  WEAPON_IDS,
  ROOM_IDS,
  MOVE_TYPES,
  ENVELOPE_FIELDS,
  SERVER_OWNED_FIELDS,
  SKELETAL_STUB_MESSAGE,
} from './catalog.js';

const NO_EFFECTS = Object.freeze([]);
const GAME_COMMANDS = new Set(Object.values(COMMANDS));

/**
 * Receives one thing a player is trying to do: choose a character, start the
 * game, move, suggest, show a card, accuse, or end a turn. Lobby setup such
 * as creating a game is left for the other subsystems. A recognized action is
 * checked, then refused, so the board, hands, and turn do not change yet.
 *
 * @param {{ actor: object, eventName: string, payload: object }} request
 * @returns {{ handled: false } | { handled: true, accepted: false, effects: readonly [], error: object }}
 */
function assessAction(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new TypeError(
      'assessAction requires an object with actor, eventName, and payload.',
    );
  }

  const { actor, eventName, payload } = request;
  if (!GAME_COMMANDS.has(eventName)) {
    return { handled: false };
  }

  const envelopeError = validateEnvelope(actor, payload);
  if (envelopeError) {
    return reject(payload, envelopeError.code, envelopeError.message);
  }

  const commandError = validateCommand(eventName, payload);
  if (commandError) {
    return reject(payload, 'BAD_REQUEST', commandError);
  }

  return reject(payload, 'ACTION_NOT_ALLOWED', SKELETAL_STUB_MESSAGE);
}

/**
 * Checks the facts every action shares: which game this is, which attempt
 * this request is, and which version of the board the player was looking at.
 * The player must already be in that game. A request from one player cannot
 * be applied to a different player's game.
 */
function validateEnvelope(actor, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { code: 'BAD_REQUEST', message: 'Payload must be an object.' };
  }
  if (!isNonEmptyString(payload.requestId)) {
    return { code: 'BAD_REQUEST', message: 'requestId is required.' };
  }
  if (!isNonEmptyString(payload.gameId)) {
    return { code: 'BAD_REQUEST', message: 'gameId is required.' };
  }
  if (!Number.isInteger(payload.expectedVersion) || payload.expectedVersion < 0) {
    return {
      code: 'BAD_REQUEST',
      message: 'expectedVersion must be a non-negative integer.',
    };
  }
  const authenticated =
    actor &&
    typeof actor === 'object' &&
    !Array.isArray(actor) &&
    isNonEmptyString(actor.playerId);
  if (!authenticated) {
    return { code: 'UNAUTHORIZED', message: 'An authenticated actor is required.' };
  }
  if (actor.gameId !== undefined && actor.gameId !== payload.gameId) {
    return {
      code: 'BAD_REQUEST',
      message: 'payload gameId does not match the authenticated actor.',
    };
  }
  return null;
}

/**
 * Sends the attempt to the check for that kind of play. Starting the game
 * and ending a turn carry no extra details beyond which game and whose turn
 * it is, so only the shared fields are allowed for those two.
 */
function validateCommand(eventName, payload) {
  const owned = serverOwnedMessage(payload);
  if (owned) {
    return owned;
  }

  switch (eventName) {
    case COMMANDS.SELECT_CHARACTER:
      return validateSelectCharacter(payload);
    case COMMANDS.START_GAME:
    case COMMANDS.END_TURN:
      return unknownFieldMessage(payload, ENVELOPE_FIELDS);
    case COMMANDS.MOVE_PLAYER:
      return validateMove(payload);
    case COMMANDS.MAKE_SUGGESTION:
      return validateSuggestion(payload);
    case COMMANDS.SUBMIT_DISPROVAL:
      return validateDisproval(payload);
    case COMMANDS.MAKE_ACCUSATION:
      return validateAccusation(payload);
    default:
      throw new Error(`No validator for game command ${eventName}.`);
  }
}

/**
 * In the lobby, a player claims one of the six suspects, such as Professor
 * Plum, before the mystery starts. This confirms the name is one of those
 * six. It does not yet stop two players from claiming the same suspect.
 */
function validateSelectCharacter(payload) {
  const idError = requireId(payload.characterId, SUSPECT_IDS, 'characterId');
  if (idError) {
    return idError;
  }
  return unknownFieldMessage(payload, [...ENVELOPE_FIELDS, 'characterId']);
}

/**
 * On a turn, a player steps through a doorway, takes a secret passage, or
 * stays in the room to make a suggestion. A stay names no destination. A
 * step or a passage must name the room or hallway the piece is entering.
 * Hallway occupancy and which doors actually connect are later rules.
 */
function validateMove(payload) {
  if (!MOVE_TYPES.includes(payload.moveType)) {
    return 'moveType must be adjacent, secret_passage, or stay.';
  }

  if (payload.moveType === 'stay') {
    if (Object.prototype.hasOwnProperty.call(payload, 'destinationId')) {
      return 'destinationId is only allowed for adjacent and secret_passage moves.';
    }
    return unknownFieldMessage(payload, [...ENVELOPE_FIELDS, 'moveType']);
  }

  if (!Object.prototype.hasOwnProperty.call(payload, 'destinationId')) {
    return 'destinationId is required for this move.';
  }
  const locationError = validateLocationId(payload.destinationId);
  if (locationError) {
    return locationError;
  }
  return unknownFieldMessage(payload, [...ENVELOPE_FIELDS, 'moveType', 'destinationId']);
}

/**
 * A suggestion says who did it and with what weapon, for example Miss
 * Scarlet with the lead pipe. The room is the room the player's own piece
 * is already standing in, so the player does not get to choose it.
 */
function validateSuggestion(payload) {
  if (Object.prototype.hasOwnProperty.call(payload, 'roomId')) {
    return "roomId is supplied by the server from the player's current room.";
  }
  const suspectError = requireId(payload.suspectId, SUSPECT_IDS, 'suspectId');
  if (suspectError) {
    return suspectError;
  }
  const weaponError = requireId(payload.weaponId, WEAPON_IDS, 'weaponId');
  if (weaponError) {
    return weaponError;
  }
  return unknownFieldMessage(payload, [...ENVELOPE_FIELDS, 'suspectId', 'weaponId']);
}

/**
 * After another player makes a suggestion, a player who holds a matching
 * card shows exactly one of those cards. The request names which suggestion
 * is being answered and which card from the hand is being shown.
 */
function validateDisproval(payload) {
  if (!isNonEmptyString(payload.suggestionId)) {
    return 'suggestionId is required.';
  }
  const cardError = validateCardId(payload.cardId);
  if (cardError) {
    return cardError;
  }
  return unknownFieldMessage(payload, [...ENVELOPE_FIELDS, 'suggestionId', 'cardId']);
}

/**
 * An accusation is the player's final claim: a suspect, a weapon, and a
 * room. A correct claim wins the game. A wrong claim removes that player
 * from taking further turns. This confirms all three names exist in the
 * game. It does not compare them with the hidden solution.
 */
function validateAccusation(payload) {
  const suspectError = requireId(payload.suspectId, SUSPECT_IDS, 'suspectId');
  if (suspectError) {
    return suspectError;
  }
  const weaponError = requireId(payload.weaponId, WEAPON_IDS, 'weaponId');
  if (weaponError) {
    return weaponError;
  }
  const roomError = requireId(payload.roomId, ROOM_IDS, 'roomId');
  if (roomError) {
    return roomError;
  }
  return unknownFieldMessage(payload, [
    ...ENVELOPE_FIELDS,
    'suspectId',
    'weaponId',
    'roomId',
  ]);
}

/**
 * A destination is a room, such as room:kitchen, or a hallway between two
 * rooms. The two rooms in a hallway name are listed alphabetically, so
 * Study-Hall and Hall-Study are the same square on the board.
 */
function validateLocationId(locationId) {
  if (typeof locationId !== 'string') {
    return 'destinationId is not a recognized location.';
  }

  const parts = locationId.split(':');
  if (parts[0] === 'room' && parts.length === 2 && ROOM_IDS.includes(parts[1])) {
    return null;
  }

  const alphabetical = parts.length === 3 && parts[1] < parts[2];
  if (
    parts[0] === 'hallway' &&
    alphabetical &&
    ROOM_IDS.includes(parts[1]) &&
    ROOM_IDS.includes(parts[2])
  ) {
    return null;
  }

  return 'destinationId is not a recognized location.';
}

/**
 * A card shown from a hand is one suspect, weapon, or room card, written as
 * category and id. weapon:rope is the rope. rope alone is not a card.
 */
function validateCardId(cardId) {
  if (typeof cardId !== 'string') {
    return 'cardId is not a recognized id.';
  }

  const parts = cardId.split(':');
  if (parts.length !== 2) {
    return 'cardId is not a recognized id.';
  }

  const lists = { suspect: SUSPECT_IDS, weapon: WEAPON_IDS, room: ROOM_IDS };
  const list = lists[parts[0]];
  if (!list || !list.includes(parts[1])) {
    return 'cardId is not a recognized id.';
  }
  return null;
}

/**
 * The hidden solution, each player's hand, whose turn it is, and where the
 * pieces stand are decided by the server. A player cannot send those facts
 * and have the game treat them as true.
 */
function serverOwnedMessage(payload) {
  for (const field of SERVER_OWNED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      return `${field} is decided by the server, not the client.`;
    }
  }
  return null;
}

/**
 * Each action carries only the details that action uses. A move cannot also
 * name a weapon, and a suggestion cannot also name a destination.
 */
function unknownFieldMessage(payload, allowedFields) {
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) {
      return `${key} is not part of this request.`;
    }
  }
  return null;
}

/**
 * The named suspect, weapon, or room must be one of the pieces in this
 * game. A blank name, or a name from outside the board such as Sherlock,
 * is not a legal choice.
 */
function requireId(value, allowed, field) {
  if (!isNonEmptyString(value)) {
    return `${field} is required.`;
  }
  if (!allowed.includes(value)) {
    return `${field} is not a recognized id.`;
  }
  return null;
}

/**
 * Rejects a blank game, player, request, suggestion, or card name before
 * it can be treated as a real choice.
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Builds the answer the player receives when the action does not happen.
 * The board, the hands, and whose turn it is stay as they were.
 */
function reject(payload, code, message) {
  const error = { code, message };
  if (payload && typeof payload.requestId === 'string') {
    error.requestId = payload.requestId;
  }
  return {
    handled: true,
    accepted: false,
    effects: NO_EFFECTS,
    error,
  };
}

export { assessAction, COMMANDS };
