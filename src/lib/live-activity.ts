import type { Message } from "@/state/store";
import { t } from "./i18n";
import type { LocaleKey } from "@/locales";

/** The activity chip `turn.retrying` writes: attempt, cap, and the backoff
 * baked in at the moment the retry was scheduled. */
const RETRY_CHIP = /^retrying — attempt (\d+)\/(\d+) in (\d+)s\b/;

export interface RetryActivity {
  attempt: number;
  max: number;
  delaySec: number;
  /** When the chip was written (message.at). 0 when the stamp is missing. */
  startedAt: number;
}

/** A settled retry chip is still the live action: the server marks it done
 * (`ok: true`) because the backoff itself is not a tool, but the turn is
 * waiting out that backoff. */
export function parseRetryActivity(message?: Message): RetryActivity | null {
  if (!message || message.kind !== "activity" || !message.tool || message.comm) return null;
  const match = RETRY_CHIP.exec(message.tool.name);
  if (!match) return null;
  const attempt = Number(match[1]);
  const max = Number(match[2]);
  const delaySec = Number(match[3]);
  if (!Number.isInteger(attempt) || attempt < 1) return null;
  if (!Number.isInteger(max) || max < 1) return null;
  if (!Number.isInteger(delaySec) || delaySec < 0) return null;
  const startedAt = Number.isFinite(message.at) && message.at > 0 ? message.at : 0;
  return { attempt, max, delaySec, startedAt };
}

/** Seconds left in the backoff. A missing stamp keeps the scheduled delay
 * so an old transcript does not pretend the wait already ended. */
export function retrySecondsRemaining(retry: Pick<RetryActivity, "delaySec" | "startedAt">, now: number): number {
  if (!retry.startedAt || !Number.isFinite(now)) return retry.delaySec;
  const elapsed = Math.floor((now - retry.startedAt) / 1000);
  if (!Number.isFinite(elapsed) || elapsed <= 0) return retry.delaySec;
  return Math.max(0, retry.delaySec - elapsed);
}

export function retryCountdownText(retry: RetryActivity, now: number): string {
  return t("chat.activity.retrying", {
    attempt: retry.attempt,
    max: retry.max,
    seconds: retrySecondsRemaining(retry, now),
  });
}

// keys, not labels: t() reads the active pack when it is called, and this
// array is built once at import time
const FALLBACK_LABELS: Array<[RegExp, LocaleKey]> = [
  [/\b(?:bash|shell|terminal|exec|command|run_command)\b/i, "chat.activity.runCommand"],
  [/\b(?:read|read_file|view|open_file)\b/i, "chat.activity.readFile"],
  [/\b(?:write|write_file|create_file)\b/i, "chat.activity.writeFile"],
  [/\b(?:edit|apply_patch|replace|str_replace)\b/i, "chat.activity.editFile"],
  [/\b(?:web_search|search_web)\b/i, "chat.activity.searchWeb"],
  [/\b(?:web_fetch|fetch_url|read_page)\b/i, "chat.activity.readPage"],
  [/\b(?:grep|glob|find|search)\b/i, "chat.activity.searching"],
  [/\b(?:screenshot|screen_capture)\b/i, "chat.activity.screen"],
  [/\b(?:click|type|keypress|press|scroll|computer)\b/i, "chat.activity.computer"],
  [/\b(?:open_url|navigate)\b/i, "chat.activity.openPage"],
  [/\b(?:list_bots|list_agents)\b/i, "chat.activity.whosAround"],
  [/\blist_rooms\b/i, "chat.activity.rooms"],
  [/\bpost_to_room\b/i, "chat.activity.postRoom"],
  [/\bdelegate_bot\b/i, "chat.activity.handoff"],
  [/\b(?:ask_bot|send_message)\b/i, "chat.activity.askTeammate"],
];

function sentenceCase(value: string): string {
  const trimmed = value.trim().replace(/[.\s]+$/, "");
  if (!trimmed) return t("chat.activity.thinking");
  return `${trimmed[0].toUpperCase()}${trimmed.slice(1)}`;
}

/**
 * The one quiet line shown while an agent is working. This follows t3code's
 * live-activity model: thinking before a tool starts, then the current verb.
 * The server-provided narration is authoritative; fallbacks cover older
 * messages and third-party drivers that only report a tool name.
 */
export function liveActivityLabel(message?: Message): string {
  const retry = parseRetryActivity(message);
  if (retry) return t("chat.activity.retryingAttempt", { attempt: retry.attempt, max: retry.max });

  if (
    message?.kind !== "activity" ||
    !message.tool ||
    message.tool.ok !== undefined ||
    message.comm
  ) {
    return t("chat.activity.thinking");
  }

  if (message.tool.spoken?.trim()) return sentenceCase(message.tool.spoken);

  const toolName = message.tool.name.replace(/^mcp__[^_]+__/, "").split(":", 1)[0] ?? "";
  for (const [pattern, key] of FALLBACK_LABELS) {
    if (pattern.test(toolName)) return t(key);
  }
  return t("chat.activity.working");
}
