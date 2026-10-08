/** Shown when an account's credits or a long quota are already used up. */
export const QUOTA_EXHAUSTED_MESSAGE =
  "This account is out of credits or its quota is used up. Wait for it to reset, or choose another model.";

const ALREADY_CLEAR = /try again at|manage usage|add credit|choose another model|wait for it to reset|subscription_sharing_usage_limit_exceeded/i;
const EXHAUSTED = /\binsufficient(?: account)? (?:funds|balance|credits)\b|\bcredits balance\b|\bprepaid credits\b|\bspend cap\b|\bout of credits\b|\bquota\b|\b(?:daily|weekly|monthly) limit\b|\bbilling\b|\busage limit\b/i;

/** A plain sentence for a raw exhausted-quota error. A message that already
 * says what to do, including this sentence, is returned unchanged. */
export function quotaExhaustedMessage(text: string): string | null {
  if (ALREADY_CLEAR.test(text) || !EXHAUSTED.test(text)) return null;
  return QUOTA_EXHAUSTED_MESSAGE;
}
