// The question box: what the bot actually asked, and its own answers.
//
// This is the card for a structured ask — Claude's AskUserQuestion. The
// provider routes it through the permission channel, so without this it
// arrived as "Deny / Always allow / Allow once" over a question like "which
// model should this bot run on?", which is not an answer to anything.
//
// One tab per question (the model names them), the model's options as chips
// (or rows, when they carry descriptions), an "Other" choice for a reply it
// did not think of, and a single submit that sends every answer back at
// once. It sits in the shared AskCard shell, and folds into one line once
// it is answered.
import { useMemo, useState } from "react";
import { Check, MessageCircleQuestion, X } from "lucide-react";
import { useStore, type Bot, type Message } from "@/state/store";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import {
  answerWithoutPreamble,
  formatQuestionAnswers,
  MAX_CUSTOM_ANSWER,
  questionAnswersByQuestion,
  type AskQuestion,
} from "../../shared/ask-question";
import {
  ASK_CHIP,
  ASK_CHIP_IDLE,
  ASK_CHIP_PICKED,
  ASK_FIELD,
  ASK_PRIMARY_BUTTON,
  ASK_QUIET_BUTTON,
  ASK_SMALL_PILL,
  AskCard,
  AskSettledLine,
  moveChoiceFocus,
  returnFocusToComposer,
} from "./AskCard";
import { ExpandableText } from "./ExpandableText";

/** What each question has been answered with so far. Option labels and the
 * free-text reply are kept apart so toggling "Other" off cannot silently
 * drop a choice the person already made. */
interface Draft {
  picked: string[];
  custom: string;
  /** "Other" is open. An empty open field is not an answer. */
  other: boolean;
}

const EMPTY: Draft = { picked: [], custom: "", other: false };

function answersOf(draft: Draft): string[] {
  const custom = draft.other ? draft.custom.trim() : "";
  return custom ? [...draft.picked, custom] : draft.picked;
}

/** The tab label: the model's own header, or a number when it gave none. */
function tabLabel(question: AskQuestion, index: number): string {
  return question.header ?? t("question.tab.numbered", { index: index + 1 });
}

/** Options with no description read best as a row of chips; any
 * description needs the room of a full row. */
export function questionUsesChips(question: AskQuestion): boolean {
  return question.options.every((option) => !option.description);
}

/**
 * The one line an answered card folds into: what was asked, then what was
 * answered. A single question names itself by its header (or its text); a
 * set lists each header beside its answer. The answer text the server kept
 * is read back per question, so the line never shows the model-facing
 * Q:/A: lead-in.
 */
export function settledQuestionLine(
  questions: readonly AskQuestion[],
  answer: string | null | undefined,
): { label: string; value: string } {
  if (!answer) return { label: t("question.status.answered"), value: "" };
  const byQuestion = questionAnswersByQuestion(answer, questions);
  const flat = (text: string) => text.replace(/\s+/g, " ").trim();
  if (questions.length === 1) {
    const only = questions[0]!;
    const value = byQuestion[only.question] ?? answerWithoutPreamble(answer);
    return { label: only.header ?? only.question, value: flat(value) };
  }
  const parts = questions.flatMap((question, index) => {
    const value = byQuestion[question.question];
    return value ? [`${tabLabel(question, index)}: ${flat(value)}`] : [];
  });
  return {
    label: t("question.status.answered"),
    value: parts.length ? parts.join(" · ") : flat(answerWithoutPreamble(answer)),
  };
}

export function QuestionCard({
  threadId,
  bot,
  message,
}: {
  /** answered by THREAD, so a question raised inside a room settles the
   * same way as one in a 1:1 chat */
  threadId: string;
  /** who is asking, for the "Name has a question" line */
  bot?: Pick<Bot, "name">;
  message: Message;
}) {
  const { dispatch } = useStore();
  const card = message.card;
  const questions = card?.questionRequest?.questions ?? [];
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [active, setActive] = useState(0);
  // The server settles the card, but only after a round trip. Holding the
  // sent answer here closes the window where the buttons are still live.
  const [sent, setSent] = useState<string | null>(null);

  const answered = useMemo(
    () => questions.map((_, index) => answersOf(drafts[index] ?? EMPTY).length > 0),
    [questions, drafts],
  );

  if (!card || !questions.length) return null;
  const settled = Boolean(card.answered) || sent !== null;
  const current = questions[Math.min(active, questions.length - 1)]!;
  const currentIndex = Math.min(active, questions.length - 1);
  const draft = drafts[currentIndex] ?? EMPTY;
  const answeredCount = answered.filter(Boolean).length;
  const complete = answeredCount === questions.length;

  const update = (index: number, next: Partial<Draft>) =>
    setDrafts((previous) => ({ ...previous, [index]: { ...(previous[index] ?? EMPTY), ...next } }));

  const choose = (label: string) => {
    if (settled) return;
    if (current.multiSelect) {
      const picked = draft.picked.includes(label)
        ? draft.picked.filter((entry) => entry !== label)
        : [...draft.picked, label];
      update(currentIndex, { picked });
      return;
    }
    // Single-select is a radio group: picking replaces, and picking an
    // option means the free-text answer was not the one they wanted.
    update(currentIndex, { picked: [label], other: false });
    // Move to the next question they still owe an answer to, the way the
    // tabs would have been clicked anyway. The last one stays put so the
    // submit button is under the cursor that just chose.
    const next = questions.findIndex((_, index) => index !== currentIndex && !answered[index]);
    if (next >= 0) setActive(next);
  };

  const toggleOther = () => {
    if (settled) return;
    if (draft.other) {
      update(currentIndex, { other: false });
      return;
    }
    update(currentIndex, { other: true, ...(current.multiSelect ? {} : { picked: [] }) });
  };

  const submit = () => {
    if (settled || !complete || !card.requestId) return;
    const answer = formatQuestionAnswers(questions, questions.map((_, index) => answersOf(drafts[index] ?? EMPTY)));
    if (!answer) return;
    setSent(answer);
    returnFocusToComposer();
    dispatch({
      type: "decideRequest",
      threadId,
      requestId: card.requestId,
      behavior: "answer",
      message: answer,
      // The answer never reached the bot, so the card must go back to
      // being answerable rather than sitting there looking settled.
      onError: () => setSent(null),
    });
  };

  if (settled) {
    const answer = card.answeredText ?? sent;
    // A question nobody answered (the run ended, or it was closed) is not
    // "answered": say so, and offer nothing to expand.
    if (!answer && card.answered && card.answered !== "answer") {
      return (
        <AskSettledLine ariaLabel={t("question.aria.card")} icon={<X size={13} />}>
          {t("question.status.closed")}
        </AskSettledLine>
      );
    }
    return <SettledQuestion questions={questions} answer={answer} />;
  }

  const single = questions.length === 1;
  const named = bot ? t("question.card.named", { name: bot.name }) : t("question.card.title");
  // One question with a header leads with that header ("Choose a plan");
  // the bot's name moves to the quiet end of the line so a room still says
  // who is asking.
  const title = single && current.header ? current.header : named;
  const meta = !single
    ? t("question.progress", { answered: answeredCount, count: questions.length })
    : single && current.header && bot ? bot.name : undefined;
  const chips = questionUsesChips(current);
  const multi = Boolean(current.multiSelect);

  return (
    <AskCard
      ariaLabel={t("question.aria.card")}
      icon={<MessageCircleQuestion size={15} />}
      title={title}
      meta={meta}
      footer={
        <>
          <span className="me-auto text-[12px] text-ink-tertiary">{t("question.status.waiting")}</span>
          <button type="button" onClick={submit} disabled={!complete} className={ASK_PRIMARY_BUTTON}>
            {questions.length > 1 ? t("question.submitAll") : t("question.submit")}
          </button>
        </>
      }
    >
      {card.questionRequest?.origin === "output" && (
        <div className="-mt-1 mb-1.5 text-[12px] text-ink-secondary">{t("question.origin.badge")}</div>
      )}

      {questions.length > 1 && (
        <div role="tablist" aria-label={t("question.aria.tabs")} className="-mt-0.5 mb-2 flex flex-wrap gap-1">
          {questions.map((question, index) => (
            <button
              key={`${index}-${question.question}`}
              type="button"
              role="tab"
              aria-selected={index === currentIndex}
              onClick={() => setActive(index)}
              className={cn(
                ASK_SMALL_PILL,
                index === currentIndex
                  ? "bg-control text-ink"
                  : "text-ink-secondary hover:bg-control/60 hover:text-ink",
              )}
            >
              {answered[index] && <Check size={14} className="text-success" />}
              {tabLabel(question, index)}
            </button>
          ))}
        </div>
      )}

      <ExpandableText text={current.question} className="text-[14px] leading-relaxed text-ink" />
      {multi && <div className="mt-0.5 text-[12px] text-ink-tertiary">{t("question.multiHint")}</div>}

      <div
        role={multi ? "group" : "radiogroup"}
        aria-label={current.question}
        onKeyDown={moveChoiceFocus}
        className={chips
          ? "mt-2.5 flex flex-wrap gap-1.5"
          : "mt-2.5 overflow-hidden rounded-lg border border-hairline/40"}
      >
        {current.options.map((option, index) => {
          const picked = draft.picked.includes(option.label);
          return chips ? (
            <Chip
              key={option.label}
              multi={multi}
              checked={picked}
              onClick={() => choose(option.label)}
              label={option.label}
            />
          ) : (
            <button
              key={option.label}
              type="button"
              data-ask-choice=""
              role={multi ? "checkbox" : "radio"}
              aria-checked={picked}
              onClick={() => choose(option.label)}
              className={cn(
                "flex w-full items-start gap-2.5 px-3 py-2 text-start",
                index > 0 && "border-t border-hairline/40",
                // `raised` is the same value as the card in the light
                // skins; `raised-hover` is the one tone every skin
                // guarantees stands off a surface.
                picked ? "bg-raised-hover" : "hover:bg-raised-hover/60",
              )}
            >
              <Marker checked={picked} multi={multi} />
              <span className="min-w-0">
                <span dir="auto" className="block text-[13px] font-medium leading-5 text-ink">{option.label}</span>
                {option.description && (
                  <span dir="auto" className="block text-[12.5px] leading-snug text-ink-secondary">{option.description}</span>
                )}
              </span>
            </button>
          );
        })}
        {chips ? (
          <Chip multi={multi} checked={draft.other} onClick={toggleOther} label={t("question.other")} />
        ) : (
          <button
            type="button"
            data-ask-choice=""
            role={multi ? "checkbox" : "radio"}
            aria-checked={draft.other}
            onClick={toggleOther}
            className={cn(
              "flex w-full items-center gap-2.5 px-3 py-2 text-start",
              current.options.length > 0 && "border-t border-hairline/40",
              draft.other ? "bg-raised-hover" : "hover:bg-raised-hover/60",
            )}
          >
            <Marker checked={draft.other} multi={multi} />
            <span className="text-[13px] font-medium leading-5 text-ink">{t("question.other")}</span>
          </button>
        )}
      </div>
      {draft.other && (
        <input
          autoFocus
          dir="auto"
          value={draft.custom}
          maxLength={MAX_CUSTOM_ANSWER}
          aria-label={t("question.otherPlaceholder")}
          onChange={(event) => update(currentIndex, { custom: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing && complete) submit();
          }}
          placeholder={t("question.otherPlaceholder")}
          className={cn(ASK_FIELD, "mt-2 block w-full")}
        />
      )}
    </AskCard>
  );
}

/** The answered card: one line, with the whole answer one tap away. */
function SettledQuestion({ questions, answer }: { questions: readonly AskQuestion[]; answer: string | null }) {
  const [open, setOpen] = useState(false);
  const line = settledQuestionLine(questions, answer);
  const full = answer ? answerWithoutPreamble(answer) : "";
  return (
    <AskSettledLine
      ariaLabel={t("question.aria.card")}
      action={full && (
        <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={ASK_QUIET_BUTTON}>
          {open ? t("question.hideDetails") : t("question.details")}
        </button>
      )}
      detail={open && full && (
        <div dir="auto" className="ms-[19px] mt-1.5 whitespace-pre-wrap break-words rounded-lg bg-inset px-3 py-2 text-[12.5px] leading-relaxed text-ink-secondary">
          {full}
        </div>
      )}
    >
      <span>{line.label}</span>
      {line.value && <span className="text-ink-secondary"> · {line.value}</span>}
    </AskSettledLine>
  );
}

/** One choice as a pill. Chosen reads as filled, so a set of picks is
 * visible at a glance without a separate marker. */
function Chip({ label, checked, multi, onClick }: { label: string; checked: boolean; multi: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-ask-choice=""
      role={multi ? "checkbox" : "radio"}
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        ASK_CHIP,
        checked ? ASK_CHIP_PICKED : ASK_CHIP_IDLE,
      )}
    >
      {checked && <Check size={14} className="text-accent-text" strokeWidth={2.5} />}
      <span dir="auto" className="min-w-0 truncate">{label}</span>
    </button>
  );
}

/** The radio dot / checkbox tick. Drawn rather than an <input> so the whole
 * row stays one button and the hit target is the row, not the 16px circle. */
function Marker({ checked, multi }: { checked: boolean; multi: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 flex size-4 shrink-0 items-center justify-center border",
        multi ? "rounded-[5px]" : "rounded-full",
        checked ? "border-accent bg-accent" : "border-hairline",
      )}
    >
      {checked &&
        (multi ? (
          <Check size={11} className="text-accent-ink" strokeWidth={3} />
        ) : (
          <span className="size-1.5 rounded-full bg-accent-ink" />
        ))}
    </span>
  );
}
