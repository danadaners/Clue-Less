/**
 * An error thrown by a subsystem when a request breaks a rule.
 * code is one of ERROR_CODES in shared/messages.js (SRS Appendix B).
 */
export class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
