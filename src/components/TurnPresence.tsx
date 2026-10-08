// Left-edge tail: mascot looks around while it works, with a live activity
// sheen beside it. The moment there is an answer, the label is gone while
// the canonical transcript row performs the settle-in animation above it.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { RetryCountdownLabel, WorkingTimer } from "@/components/WorkingIndicator";
import { retryPresence, type RetryActivity } from "@/lib/live-activity";

export function TurnPresence({
  avatar,
  visible,
  label = "Thinking",
  answering = false,
  since = null,
  retry = null,
}: {
  avatar: ReactNode;
  visible: boolean;
  label?: string;
  answering?: boolean;
  /** Turn start (epoch ms) — shows a self-ticking elapsed readout while working. */
  since?: number | null;
  /** A retry backoff replaces the verb and the elapsed timer with a countdown. */
  retry?: RetryActivity | null;
}) {
  const [mounted, setMounted] = useState(visible);
  const [phase, setPhase] = useState<"think" | "answer" | "out">(answering ? "answer" : "think");
  const [retryNow, setRetryNow] = useState(() => Date.now());
  const wasAnswering = useRef(answering);

  // The retry chip stays the last activity after the delay, while the reply
  // streams invisibly. Drop the countdown on that deadline so the elapsed
  // timer can take over without waiting for another transcript frame.
  useEffect(() => {
    const current = Date.now();
    setRetryNow(current);
    if (!retry?.startedAt) return;
    const delay = retry.startedAt + retry.delaySec * 1000 - current;
    if (delay <= 0) return;
    const timer = setTimeout(() => setRetryNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [retry?.attempt, retry?.delaySec, retry?.max, retry?.startedAt]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setPhase(answering ? "answer" : "think");
      wasAnswering.current = answering;
      return;
    }
    if (!mounted) return;
    const handoff = wasAnswering.current;
    wasAnswering.current = false;
    if (handoff) {
      setMounted(false);
      return;
    }
    setPhase("out");
    const timer = setTimeout(() => setMounted(false), 280);
    return () => clearTimeout(timer);
  }, [visible, answering, mounted]);

  if (!mounted) return null;
  const showWorking = phase === "think";
  const presence = retryPresence(retry ?? null, label, retryNow);
  return (
    <div className="turn-presence flex flex-col items-start">
      <div
        className={cn(
          "flex items-center gap-2",
          phase === "think" && "turn-mascot-in",
          phase === "out" && "turn-mascot-out",
        )}
      >
        {avatar}
        {showWorking ? (
          <span className="flex items-baseline gap-2 leading-none">
            {presence.countdown && retry ? (
              <RetryCountdownLabel retry={retry} />
            ) : (
              <span className="thinking-shimmer animate-shimmer text-[13px]">
                {presence.label}
              </span>
            )}
            {since !== null && !presence.countdown && (
              <WorkingTimer since={since} className="text-[11.5px] text-ink-tertiary" />
            )}
          </span>
        ) : null}
      </div>
    </div>
  );
}
