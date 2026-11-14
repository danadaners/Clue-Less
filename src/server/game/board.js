/**
 * Game board: 9 rooms, 12 hallways, secret passages, and six character tokens.
 * Design Document §3.6 (Board / Location / Room / Hallway / CharacterToken).
 */

import { ROOM_IDS, SUSPECT_IDS } from './catalog.js';

const ROOM_CAPACITY = 6;
const HALLWAY_CAPACITY = 1;

/** Adjacent room pairs (unordered). Each pair gets one hallway. */
const ADJACENT_ROOM_PAIRS = Object.freeze([
  ['study', 'hall'],
  ['hall', 'lounge'],
  ['study', 'library'],
  ['hall', 'billiard_room'],
  ['lounge', 'dining_room'],
  ['library', 'billiard_room'],
  ['billiard_room', 'dining_room'],
  ['library', 'conservatory'],
  ['billiard_room', 'ballroom'],
  ['dining_room', 'kitchen'],
  ['conservatory', 'ballroom'],
  ['ballroom', 'kitchen'],
]);

/** Corner secret passages (Design + Clue-Less.pdf). */
const SECRET_PASSAGES = Object.freeze([
  ['study', 'kitchen'],
  ['lounge', 'conservatory'],
]);

/**
 * FR-22 / Fig. 1 starting hallways for all six suspects.
 * Hallway ids list the two rooms alphabetically.
 */
export const START_POSITIONS = Object.freeze({
  miss_scarlet: hallwayId('hall', 'lounge'),
  colonel_mustard: hallwayId('dining_room', 'lounge'),
  mrs_white: hallwayId('ballroom', 'kitchen'),
  mr_green: hallwayId('ballroom', 'conservatory'),
  mrs_peacock: hallwayId('conservatory', 'library'),
  professor_plum: hallwayId('library', 'study'),
});

export function roomLocationId(roomId) {
  return `room:${roomId}`;
}

export function hallwayId(roomA, roomB) {
  return roomA < roomB
    ? `hallway:${roomA}:${roomB}`
    : `hallway:${roomB}:${roomA}`;
}

function parseLocationId(locationId) {
  if (typeof locationId !== 'string') {
    return null;
  }
  const parts = locationId.split(':');
  if (parts[0] === 'room' && parts.length === 2 && ROOM_IDS.includes(parts[1])) {
    return { kind: 'room', roomId: parts[1] };
  }
  if (
    parts[0] === 'hallway' &&
    parts.length === 3 &&
    parts[1] < parts[2] &&
    ROOM_IDS.includes(parts[1]) &&
    ROOM_IDS.includes(parts[2])
  ) {
    return { kind: 'hallway', roomA: parts[1], roomB: parts[2] };
  }
  return null;
}

/**
 * One square on the board: a room or a hallway.
 */
class Location {
  /**
   * @param {string} id
   * @param {'room' | 'hallway'} kind
   * @param {number} capacity
   */
  constructor(id, kind, capacity) {
    this.id = id;
    this.kind = kind;
    this.capacity = capacity;
    /** @type {Location[]} */
    this.adjacent = [];
    /** @type {Set<string>} characterIds currently here */
    this.occupants = new Set();
    /** @type {Location | null} */
    this.secretPassage = null;
  }

  canEnter() {
    return this.occupants.size < this.capacity;
  }
}

/**
 * Authoritative board geometry and token positions.
 */
export class Board {
  constructor() {
    /** @type {Map<string, Location>} */
    this.locations = new Map();
    /** @type {Map<string, string>} characterId → locationId */
    this.tokenLocations = new Map();

    for (const roomId of ROOM_IDS) {
      const loc = new Location(roomLocationId(roomId), 'room', ROOM_CAPACITY);
      this.locations.set(loc.id, loc);
    }

    for (const [a, b] of ADJACENT_ROOM_PAIRS) {
      const id = hallwayId(a, b);
      const hallway = new Location(id, 'hallway', HALLWAY_CAPACITY);
      this.locations.set(id, hallway);
      const roomA = this.locations.get(roomLocationId(a));
      const roomB = this.locations.get(roomLocationId(b));
      linkAdjacent(roomA, hallway);
      linkAdjacent(roomB, hallway);
    }

    for (const [a, b] of SECRET_PASSAGES) {
      const roomA = this.locations.get(roomLocationId(a));
      const roomB = this.locations.get(roomLocationId(b));
      roomA.secretPassage = roomB;
      roomB.secretPassage = roomA;
    }
  }

  /**
   * Puts each of the six tokens on its starting hallway.
   * @param {Readonly<Record<string, string>>} [startPositions]
   */
  placeTokens(startPositions = START_POSITIONS) {
    this.tokenLocations.clear();
    for (const loc of this.locations.values()) {
      loc.occupants.clear();
    }
    for (const characterId of SUSPECT_IDS) {
      const locationId = startPositions[characterId];
      if (!locationId || !this.locations.has(locationId)) {
        throw new Error(`Missing start location for ${characterId}.`);
      }
      this.#setTokenLocation(characterId, locationId);
    }
  }

  /**
   * @param {string} characterId
   * @returns {string | undefined}
   */
  getTokenLocation(characterId) {
    return this.tokenLocations.get(characterId);
  }

  /**
   * Snapshot for game_state_update / SRS characterPositions.
   * @returns {{ characterId: string, locationId: string }[]}
   */
  getCharacterPositions() {
    return SUSPECT_IDS.map((characterId) => ({
      characterId,
      locationId: this.tokenLocations.get(characterId),
    }));
  }

  /**
   * Design §3.6 isLegalMove.
   * From a hallway: only an adjacent room.
   * From a room: an adjacent hallway with space, or a secret passage.
   * stay is handled by the caller (suggestion-moved into a room).
   *
   * @param {string} characterId
   * @param {string} moveType
   * @param {string | undefined} destinationId
   */
  isLegalMove(characterId, moveType, destinationId) {
    const fromId = this.tokenLocations.get(characterId);
    if (!fromId) {
      return false;
    }
    const from = this.locations.get(fromId);
    if (!from) {
      return false;
    }

    if (moveType === 'stay') {
      return from.kind === 'room' && destinationId === undefined;
    }

    if (destinationId === undefined || !this.locations.has(destinationId)) {
      return false;
    }
    const to = this.locations.get(destinationId);
    if (to.occupants.has(characterId)) {
      return false;
    }
    if (!to.canEnter()) {
      return false;
    }

    if (moveType === 'secret_passage') {
      return (
        from.kind === 'room' &&
        to.kind === 'room' &&
        from.secretPassage === to
      );
    }

    if (moveType === 'adjacent') {
      if (from.kind === 'hallway') {
        return to.kind === 'room' && from.adjacent.includes(to);
      }
      if (from.kind === 'room') {
        return to.kind === 'hallway' && from.adjacent.includes(to);
      }
    }

    return false;
  }

  /**
   * Moves a token and returns the updated characterPositions list.
   * @param {string} characterId
   * @param {string} destinationId
   */
  updatePosition(characterId, destinationId) {
    if (!SUSPECT_IDS.includes(characterId)) {
      throw new Error(`Unknown characterId: ${characterId}`);
    }
    if (!this.locations.has(destinationId)) {
      throw new Error(`Unknown destinationId: ${destinationId}`);
    }
    const to = this.locations.get(destinationId);
    const fromId = this.tokenLocations.get(characterId);
    if (fromId === destinationId) {
      return this.getCharacterPositions();
    }
    if (!to.occupants.has(characterId) && !to.canEnter()) {
      throw new Error(`Location ${destinationId} is at capacity.`);
    }
    if (fromId) {
      this.locations.get(fromId).occupants.delete(characterId);
    }
    this.#setTokenLocation(characterId, destinationId);
    return this.getCharacterPositions();
  }

  /**
   * True when the named location is a room.
   * @param {string} locationId
   */
  isRoom(locationId) {
    const loc = this.locations.get(locationId);
    return Boolean(loc && loc.kind === 'room');
  }

  /**
   * True when the named location is a hallway.
   * @param {string} locationId
   */
  isHallway(locationId) {
    const loc = this.locations.get(locationId);
    return Boolean(loc && loc.kind === 'hallway');
  }

  /**
   * @param {string} locationId
   * @returns {Location | undefined}
   */
  getLocation(locationId) {
    return this.locations.get(locationId);
  }

  /**
   * @returns {number}
   */
  get locationCount() {
    return this.locations.size;
  }

  #setTokenLocation(characterId, locationId) {
    this.tokenLocations.set(characterId, locationId);
    this.locations.get(locationId).occupants.add(characterId);
  }
}

function linkAdjacent(a, b) {
  if (!a.adjacent.includes(b)) {
    a.adjacent.push(b);
  }
  if (!b.adjacent.includes(a)) {
    b.adjacent.push(a);
  }
}

export { parseLocationId, ADJACENT_ROOM_PAIRS, SECRET_PASSAGES };
