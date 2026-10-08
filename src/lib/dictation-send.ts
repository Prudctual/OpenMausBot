/** How a send keypress should treat a dictation session that is still open. */
export type DictationSendPlan = "finish-then-send" | "send";

export type SpeechTranscriptLine = { partial?: boolean; text?: string };

export type DictationLineAction =
  | { type: "send"; text: string }
  | { type: "update"; text: string };

export type DictationEndAction = "send-current" | "stop";

/** A recognizer that can emit a final transcript should finish before the
 * message goes out. Without that hook the current text sends immediately. */
export function dictationSendPlan(recording: boolean, canFinish: boolean): DictationSendPlan {
  return recording && canFinish ? "finish-then-send" : "send";
}

/** Text a finished utterance should send. A final line replaces the live
 * partial and keeps anything typed before the mic turned on. */
export function dictatedSendText(
  base: string,
  line: SpeechTranscriptLine,
  current: string,
): string {
  if (line.partial === false && typeof line.text === "string") {
    const spoken = line.text.trim();
    const prefix = base.trim();
    if (!spoken) return prefix || current;
    return prefix ? `${prefix} ${spoken}` : spoken;
  }
  return current;
}

/** What the composer should do with one transcript line. A final line sends
 * only while a send is waiting on that final. Other lines fill the box. */
export function dictationLineAction(
  finishing: boolean,
  base: string,
  current: string,
  line: SpeechTranscriptLine,
): DictationLineAction {
  if (finishing && line.partial === false && typeof line.text === "string") {
    return { type: "send", text: dictatedSendText(base, line, current) };
  }
  if (typeof line.text === "string") {
    const prefix = base.trim();
    return { type: "update", text: prefix ? `${prefix} ${line.text}` : line.text };
  }
  return { type: "update", text: current };
}

/** The recognizer closed before a final line. Send the text already in the
 * box when a send is waiting, otherwise just stop. */
export function dictationEndAction(finishing: boolean): DictationEndAction {
  return finishing ? "send-current" : "stop";
}

/** Leave the helper running while a send is waiting for its final line.
 * Stopping it drops that line. */
export function keepSpeechSession(finishing: boolean): boolean {
  return finishing;
}
