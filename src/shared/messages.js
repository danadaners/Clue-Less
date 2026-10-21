/**
 * The shared interface definition between the client and server
 * subsystems, implementing the message names specified in SRS Appendix B.
 *
 *  Message names are read-only.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Messages = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const CLIENT = Object.freeze({
    CREATE_GAME: "create_game",
    JOIN_GAME: "join_game",
    SELECT_CHARACTER: "select_character",
    START_GAME: "start_game",
    MOVE_PLAYER: "move_player",
    MAKE_SUGGESTION: "make_suggestion",
    SUBMIT_DISPROVAL: "submit_disproval",
    MAKE_ACCUSATION: "make_accusation",
    END_TURN: "end_turn",
    RECONNECT_SESSION: "reconnect_session",
    REQUEST_STATE: "request_state",
  });

  // Private Events
  const PRIVATE = Object.freeze({
    COMMAND_RESULT: "command_result",
    ERROR: "error",
    LOBBY_JOINED: "lobby_joined",
    GAME_STARTED: "game_started",
    PLAYER_VIEW_UPDATE: "player_view_update",
    DISPROVAL_REQUEST: "disproval_request",
    DISPROVAL_RESULT: "disproval_result",
    RECONNECT_SUCCESS: "reconnect_success",
    STATE_SNAPSHOT: "state_snapshot",
  });

  // Public events
  const PUBLIC = Object.freeze({
    LOBBY_UPDATE: "lobby_update",
    GAME_STATE_UPDATE: "game_state_update",
    DISPROVAL_PUBLIC: "disproval_public",
    ACCUSATION_RESULT: "accusation_result",
    PLAYER_DISCONNECTED: "player_disconnected",
    PLAYER_RECONNECTED: "player_reconnected",
    GAME_WON: "game_won",
    GAME_ENDED_NO_WINNER: "game_ended_no_winner",
    GAME_CANCELLED_DISCONNECT: "game_cancelled_disconnect",
  });

  // Error codes
  const ERROR_CODES = Object.freeze({
    BAD_REQUEST: "BAD_REQUEST",
    UNAUTHORIZED: "UNAUTHORIZED",
    ALREADY_JOINED: "ALREADY_JOINED",
    GAME_NOT_FOUND: "GAME_NOT_FOUND",
    GAME_FULL: "GAME_FULL",
    GAME_IN_PROGRESS: "GAME_IN_PROGRESS",
    CAPACITY_REACHED: "CAPACITY_REACHED",
    CHARACTER_TAKEN: "CHARACTER_TAKEN",
    NOT_HOST: "NOT_HOST",
    START_NOT_READY: "START_NOT_READY",
    GAME_PAUSED: "GAME_PAUSED",
    NOT_YOUR_TURN: "NOT_YOUR_TURN",
    ACTION_NOT_ALLOWED: "ACTION_NOT_ALLOWED",
    INVALID_CARD: "INVALID_CARD",
    STALE_SUGGESTION: "STALE_SUGGESTION",
    STALE_STATE: "STALE_STATE",
    SESSION_EXPIRED: "SESSION_EXPIRED",
    GAME_ENDED: "GAME_ENDED",
  });

  return Object.freeze({ CLIENT, PRIVATE, PUBLIC, ERROR_CODES });
});
