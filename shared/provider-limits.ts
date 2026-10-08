/** A provider asked this turn to wait longer than the retry cap allows. */
export const LONG_RETRY_MESSAGE =
  "The provider asked for a wait longer than 30 seconds, so this turn stopped. That usually means a daily or billing limit. Wait for it to reset, or choose another model.";

/** The account's credits or a long quota are already used up. */
export const QUOTA_EXHAUSTED_MESSAGE =
  "This account is out of credits or its quota is used up. Wait for it to reset, or choose another model.";
