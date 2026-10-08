/** A provider asked this turn to wait longer than the retry cap allows. */
export const LONG_RETRY_MESSAGE =
  "The provider asked for a wait longer than 30 seconds, so this turn stopped. That usually means a daily or billing limit. Wait for it to reset, or choose another model.";

/** The account's credits or a long quota are already used up. */
export const QUOTA_EXHAUSTED_MESSAGE =
  "This account is out of credits or its quota is used up. Wait for it to reset, or choose another model.";

const ALREADY_CLEAR = /try again at|manage usage|add credit|choose another model|wait for it to reset|subscription_sharing_usage_limit_exceeded/i;
const EXHAUSTED = /\binsufficient(?: account)? (?:funds|balance|credits)\b|\bcredits balance\b|\bprepaid credits\b|\bspend cap\b|\bout of credits\b|\bquota\b|\b(?:daily|weekly|monthly) limit\b|\bbilling\b|\busage limit\b/i;

/** A plain sentence for a raw exhausted-quota error, or null when the
 * text already says what to do or is not that kind of limit. */
export function quotaExhaustedMessage(text: string): string | null {
  if (ALREADY_CLEAR.test(text) || !EXHAUSTED.test(text)) return null;
  return QUOTA_EXHAUSTED_MESSAGE;
}
