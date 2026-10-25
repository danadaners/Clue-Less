/**
 * Skeletal Session Management stub.
 *
 * Communication calls admitPlayer when a player creates or joins a game.
 * The returned playerId is that player's identity for this connection.
 * Reconnect and resume tokens are later work.
 */

import { randomUUID } from "node:crypto";

export function admitPlayer({ gameId, displayName }) {
  const playerId = randomUUID();
  console.log(
    `Session: admitPlayer returned ${playerId} for ${displayName} in game ${gameId}`,
  );
  return { playerId };
}
