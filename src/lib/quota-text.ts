import { t } from "@/lib/i18n";
import { QUOTA_EXHAUSTED_MESSAGE } from "../../shared/quota-message";

/** The desktop reading of a stored exhausted-quota sentence. English matches
 * the stored words, so the row does not open Details. Phones keep the stored
 * English sentence. */
export function localizedQuotaCause(cause: string): string {
  return cause === QUOTA_EXHAUSTED_MESSAGE ? t("chat.error.quotaExhausted") : cause;
}
