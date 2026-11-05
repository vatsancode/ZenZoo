/**
 * An error whose message was written for the person using the app, such as "That sale doesn't
 * exist." or "Enter the refund amount.". Its text is safe to show on screen or hand to an AI
 * assistant exactly as written.
 *
 * Use it only for messages we wrote ourselves. Never wrap a database or library error in it:
 * those carry internal details (server addresses, table names, file paths). Anything thrown as a
 * plain Error is treated as unknown and should not be shown as is.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}
