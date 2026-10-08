import { quotaExhaustedMessage } from "../shared/provider-limits.ts";

/** The words a failed turn stores. One place, so a raw provider quota
 * reads the same from every driver and a sentence that already says what
 * to do is left alone. */
export function turnErrorText(message: string): string {
  return quotaExhaustedMessage(message) ?? message;
}
