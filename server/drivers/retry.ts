// Transient-failure classification + capped backoff for turn drivers
// (plan v2 §3.4). Pure functions — no timers, no events — so the drivers
// keep owning process lifetime while sharing one policy: a provider hiccup
// (429/5xx/overloaded/reset) gets up to MAX_ATTEMPTS tries, an auth or
// request-shape problem never does.
import type { ProviderErrorCode } from "../contracts.ts";
import { isProviderSafetyBlock } from "../../shared/provider-safety.ts";
import { LONG_RETRY_MESSAGE, quotaExhaustedMessage } from "../../shared/provider-limits.ts";

export const RETRY_MAX_ATTEMPTS = 3;

/** A Retry-After longer than this is a daily or billing cap, not a hiccup. */
export const RETRY_AFTER_CAP_MS = 30_000;

/** Backoff schedule before attempt N (N is 1-based over retries): 1s / 3s / 8s. */
export const BACKOFF_BASE_MS = [1_000, 3_000, 8_000] as const;

export type TransientReason =
  | "rate_limited"
  | "overloaded"
  | "server_error"
  | "connection_reset"
  | "timeout";

export type TerminalReason =
  | "auth"
  | "quota"
  | "unknown_model"
  | "invalid_request"
  | "not_found"
  | ProviderErrorCode
  | "terminal_exit"
  | "interrupted"
  | "unknown";

export interface ErrorClassification {
  transient: boolean;
  reason: string;
}

const TRANSIENT_PATTERNS: Array<{ pattern: RegExp; reason: TransientReason }> = [
  { pattern: /\b(?:429|rate.?limit|too many requests)\b/i, reason: "rate_limited" },
  { pattern: /\boverloaded\b|\bcapacity\b/i, reason: "overloaded" },
  { pattern: /\b5\d{2}\b|\binternal server error\b|\bbad gateway\b|\bservice unavailable\b/i, reason: "server_error" },
  {
    pattern:
      /\b(?:econnreset|econnrefused|epipe|etimedout|eai_again|connection reset|connection refused|socket hang up|network error|fetch failed)\b/i,
    reason: "connection_reset",
  },
  { pattern: /\btimeout(ed)?\b|\btimed? out\b/i, reason: "timeout" },
];

const TERMINAL_PATTERNS: Array<{ pattern: RegExp; reason: TerminalReason }> = [
  {
    pattern: /\b(?:40[13]|unauthorized|forbidden|invalid api key|missing bearer|authentication required|not logged in|logged out)\b/i,
    reason: "auth",
  },
  // A subscription's usage window is hours away, so its limit is terminal
  // for this engine even when the provider phrases it as a rate limit;
  // checked before the transient 429 pattern for that reason.
  { pattern: /\busage limit\b|\bhit your (?:usage )?limit\b|\b(?:weekly|daily|monthly|subscription|usage) limit reached\b|\bout of credits\b/i, reason: "quota" },
  { pattern: /\binsufficient(?: account)? (?:funds|balance|credits)\b|\bcredits balance\b|\bprepaid credits\b|\bspend cap\b|\b(?:daily|weekly|monthly) limit\b/i, reason: "quota" },
  { pattern: /\b402\b|\bquota\b|\bbilling\b|\bsubscription\b/i, reason: "quota" },
  { pattern: /\bmodel not found\b|\bunknown model\b|\bdoes not exist for model\b|\bunsupported model\b/i, reason: "unknown_model" },
  { pattern: /\b400\b|\b422\b|\binvalid request\b|\bmalformed\b|\bunexpected status\b/i, reason: "invalid_request" },
  { pattern: /\b404\b|\bno such thread\b|\bthread gone\b/i, reason: "not_found" },
  // interrupt/cancel vocabulary from the drivers' own stop paths — a turn the
  // user stopped must never come back as an auto-retry
  { pattern: /\b(?:interrupted|cancelled by user)\b/i, reason: "interrupted" },
];

/** A CLI exit report, as drivers assemble it from a child process's close
 * event: the numeric exit code plus whatever stderr survived. */
interface CliExit {
  exitCode: number | null;
  stderr?: string;
}

/** A bare failure message, wrapped so the classifier's inputs stay named
 * domain values rather than unparsed primitives. */
interface FailureText {
  text: string;
}

/** The failure shapes drivers actually hand the classifier. */
type FailureInput = Error | CliExit | FailureText | null;

const messageOf = (err: FailureInput): string => {
  if (!err) return "";
  if (err instanceof Error) return `${err.message}${err.cause ? ` ${String(err.cause)}` : ""}`;
  if ("text" in err) return err.text;
  return [err.stderr ?? "", ""].join(" ").trim();
};

/** Classify a thrown error or a CLI exit into retry-worthy vs terminal.
 *
 * Exit-report shape: a nonzero exit with no error text is treated as
 * terminal (`terminal_exit`) — drivers only reach it after the CLI already
 * reported its own protocol-level failure. A signal kill (negative code) is
 * never retried either.
 */
export function classifyError(err: FailureInput): ErrorClassification {
  const text = messageOf(err);
  // A surrounding HTTP 5xx/429 must not replay a provider safety block.
  if (isProviderSafetyBlock(text)) return { transient: false, reason: "provider_safety" };
  if (err && "exitCode" in err) {
    const { exitCode: code } = err;
    if (code !== null && code < 0) return { transient: false, reason: "interrupted" };
    for (const { pattern, reason } of TERMINAL_PATTERNS) {
      if (pattern.test(text)) return { transient: false, reason };
    }
    for (const { pattern, reason } of TRANSIENT_PATTERNS) {
      if (pattern.test(text)) return { transient: true, reason };
    }
    return { transient: false, reason: "terminal_exit" };
  }
  for (const { pattern, reason } of TERMINAL_PATTERNS) {
    if (pattern.test(text)) return { transient: false, reason };
  }
  for (const { pattern, reason } of TRANSIENT_PATTERNS) {
    if (pattern.test(text)) return { transient: true, reason };
  }
  return { transient: false, reason: "unknown" };
}

/** Capped exponential delay with jitter, in milliseconds. Attempt 0 (the
 * first retry) waits ~1s, then ~3s, then ~8s; beyond that the cap holds.
 * Jitter stays within ±25% so tests can bound it and a thundering herd of
 * bots doesn't re-sync on the same tick. */
export function computeBackoff(attempt: number, random: () => number = Math.random): number {
  const base = BACKOFF_BASE_MS[Math.min(Math.max(attempt, 0), BACKOFF_BASE_MS.length - 1)];
  const jitter = base * 0.25;
  return Math.round(base - jitter + random() * jitter * 2);
}

const RETRY_AFTER_HEADER = /(?:^|[^a-z0-9-])retry-after:\s*([^\r\n]+)/i;

/** Delay-seconds or an HTTP date, in milliseconds. A past date is 0.
 * Anything else is unusable and the caller keeps the fixed schedule. */
export function parseRetryAfter(header: string, now = Date.now()): number | null {
  const value = header.trim();
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds)) return null;
    if (seconds > RETRY_AFTER_CAP_MS / 1000) return RETRY_AFTER_CAP_MS + 1;
    return seconds * 1000;
  }
  if (!/[a-z]/i.test(value)) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, parsed - now);
}

function retryAfterHeader(error: unknown, text: string | undefined): string | null {
  if (error && typeof error === "object" && "retryAfter" in error) {
    const value = (error as { retryAfter?: unknown }).retryAfter;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const source = text ?? (error instanceof Error ? error.message : "");
  return RETRY_AFTER_HEADER.exec(source)?.[1]?.trim() ?? null;
}

export type RetryPlan =
  | { stop: true; message: string }
  | { stop: false; delayMs: number };

/** The wait before the next attempt. A usable Retry-After replaces the
 * 1s/3s/8s schedule with no jitter. Longer than the cap, the turn stops. */
export function planRetry(input: {
  attempt: number;
  error?: unknown;
  text?: string;
  random?: () => number;
  now?: number;
}): RetryPlan {
  const header = retryAfterHeader(input.error, input.text);
  if (header !== null) {
    const delayMs = parseRetryAfter(header, input.now ?? Date.now());
    if (delayMs !== null) {
      if (delayMs > RETRY_AFTER_CAP_MS) return { stop: true, message: LONG_RETRY_MESSAGE };
      return { stop: false, delayMs };
    }
  }
  return { stop: false, delayMs: computeBackoff(input.attempt, input.random) };
}

/** A plain sentence when this is a quota failure and the text is a raw
 * long-quota error. A message that already says what to do stays as the
 * driver wrote it. A short rate limit never classifies as quota. */
export function quotaStopMessage(text: string): string | null {
  if (classifyError({ text }).reason !== "quota") return null;
  return quotaExhaustedMessage(text);
}

/** A cancellable backoff sleep. An interrupt during the wait resolves at
 * once with "cancelled" — the caller settles the turn as interrupted
 * instead of relaunching, so no zombie process outlives the user's stop. */
export interface BackoffWait {
  promise: Promise<"elapsed" | "cancelled">;
  cancel: () => void;
}

export function interruptibleDelay(ms: number, signal?: AbortSignal): BackoffWait {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let onCancel: (() => void) | null = null;
  const promise = new Promise<"elapsed" | "cancelled">((resolve) => {
    timer = setTimeout(() => resolve("elapsed"), Math.max(1, ms));
    timer.unref?.();
    if (signal?.aborted) return resolve("cancelled");
    onCancel = () => {
      clearTimeout(timer!);
      resolve("cancelled");
    };
    signal?.addEventListener("abort", onCancel, { once: true });
  });
  return {
    promise,
    cancel: () => onCancel?.(),
  };
}
