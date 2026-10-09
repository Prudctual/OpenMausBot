// The one shape every in-chat ask shares: a question with choices, a key
// to paste, an app to sign in to. While it waits it is a compact card with
// its title in the accent ink, an optional line on why, and the one control
// that answers it. Once answered it folds into a single quiet line, the way
// a settled approval does, so a long chat does not keep a stack of boxes
// for things that are already done.
import type { KeyboardEvent, ReactNode } from "react";
import { Check, X } from "lucide-react";

export function AskCard({
  icon,
  title,
  meta,
  explanation,
  onDismiss,
  dismissLabel,
  ariaLabel,
  tour,
  children,
  footer,
}: {
  icon: ReactNode;
  title: ReactNode;
  /** small trailing text on the title line, such as "1 of 2 answered" */
  meta?: ReactNode;
  /** one short line on why the bot is asking */
  explanation?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  ariaLabel: string;
  tour?: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-tour={tour}
      data-ask-card="pending"
      className="w-full max-w-[600px] rounded-xl border border-accent/30 bg-card px-3.5 py-3 text-start"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true" className="flex shrink-0 text-accent-text">{icon}</span>
        <div dir="auto" className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-accent-text">{title}</div>
        {meta && <span className="shrink-0 text-[11.5px] tabular-nums text-ink-tertiary">{meta}</span>}
        {onDismiss && dismissLabel && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={dismissLabel}
            title={dismissLabel}
            className="-me-1 shrink-0 rounded-md p-1 text-ink-tertiary hover:bg-control hover:text-ink"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {explanation && <div className="mt-1 text-[13px] leading-snug text-ink-secondary">{explanation}</div>}
      {children && <div className="mt-2.5">{children}</div>}
      {footer && <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">{footer}</div>}
    </div>
  );
}

/** The answered ask: one quiet line, with room for a trailing action
 * (Details, Try again) and an optional block under it. */
export function AskSettledLine({
  icon,
  children,
  action,
  detail,
  ariaLabel,
}: {
  /** defaults to a green tick */
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  detail?: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-ask-card="settled"
      className="w-full max-w-[600px] text-start text-[12.5px] text-ink-tertiary"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span aria-hidden="true" className="flex shrink-0">
          {icon ?? <Check size={13} className="text-success/80" />}
        </span>
        <span dir="auto" aria-live="polite" className="min-w-0 truncate">{children}</span>
        {action}
      </div>
      {detail}
    </div>
  );
}

/** The accent fill every ask's main button uses. `accent-ink` rather than
 * white: Foundry's brass accent needs dark ink to stay readable. */
export const ASK_PRIMARY_BUTTON =
  "inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-[12.5px] font-medium text-accent-ink transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40";

/** A quiet text button for a settled line (Details, Continue task). */
export const ASK_QUIET_BUTTON =
  "shrink-0 rounded-md px-1.5 py-0.5 text-[12px] text-ink-tertiary hover:bg-inset hover:text-ink-secondary";

/** An answered ask folds away with the control that answered it, which
 * would drop keyboard focus onto the page. Hand it to the composer, where
 * the conversation continues. */
export function returnFocusToComposer(): void {
  if (typeof requestAnimationFrame !== "function") return;
  requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('[data-tour="composer"] textarea')?.focus());
}

/** Arrow keys walk a row of choices the way they walk a radio group. Left
 * and Right follow the reading direction, so in a right-to-left chat the
 * arrow pointing forward still moves forward. */
export function moveChoiceFocus(event: KeyboardEvent<HTMLElement>): void {
  const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
  if (!keys.includes(event.key)) return;
  const group = event.currentTarget;
  const items = Array.from(group.querySelectorAll<HTMLElement>("[data-ask-choice]:not([disabled])"));
  if (!items.length) return;
  const current = items.indexOf(document.activeElement as HTMLElement);
  const rtl = getComputedStyle(group).direction === "rtl";
  const forward = event.key === "ArrowDown" || event.key === (rtl ? "ArrowLeft" : "ArrowRight");
  const backward = event.key === "ArrowUp" || event.key === (rtl ? "ArrowRight" : "ArrowLeft");
  let next = current;
  if (event.key === "Home") next = 0;
  else if (event.key === "End") next = items.length - 1;
  else if (forward) next = current < 0 ? 0 : (current + 1) % items.length;
  else if (backward) next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
  event.preventDefault();
  items[next]?.focus();
}
