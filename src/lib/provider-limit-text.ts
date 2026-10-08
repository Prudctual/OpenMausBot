import { t } from "@/lib/i18n";
import { LONG_RETRY_MESSAGE, QUOTA_EXHAUSTED_MESSAGE } from "../../shared/provider-limits";

/** The desktop reading of a stored English limit sentence. Phones keep the
 * stored words. English itself matches, so the row does not open Details. */
export function localizedFailureCause(cause: string): string {
  if (cause === LONG_RETRY_MESSAGE) return t("chat.error.longRetry");
  if (cause === QUOTA_EXHAUSTED_MESSAGE) return t("chat.error.quotaExhausted");
  return cause;
}
