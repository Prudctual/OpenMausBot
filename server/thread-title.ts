// What a generated thread title is asked from.
//
// A fresh thread is named from its first message. "Regenerate title" (#1858)
// names it again from the conversation as it is now: the newest user and bot
// lines, never tool output, cards or screen frames, and bounded so the
// one-shot stays as cheap as the first-message one.
import { basename } from "node:path";

import { decodeAttachmentAttribute } from "./message-file.ts";
import { redactSecretsInText } from "./redact.ts";
import type { Message } from "./store.ts";

/** The most text either kind of title one-shot ever sees. */
export const TITLE_INPUT_MAX_CHARS = 1_500;
const EXCERPT_MAX_MESSAGES = 12;
const EXCERPT_LINE_MAX_CHARS = 300;
const ATTACHMENT_TAG = /<attached-(?:image|file)\b[^>]*\/>/g;

function oneLine(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    out += code < 32 || code === 127 ? " " : char;
  }
  return out.replace(/\s+/g, " ").trim();
}

function attachmentLabel(tag: string): string {
  const name = /\bname="([^"]*)"/.exec(tag)?.[1];
  const path = /\bpath="([^"]*)"/.exec(tag)?.[1];
  const decodedName = name === undefined ? "" : oneLine(decodeAttachmentAttribute(name));
  const decodedPath = path === undefined ? "" : oneLine(basename(decodeAttachmentAttribute(path).replaceAll("\\", "/")));
  return decodedName || decodedPath;
}

/** File names from a message that is only attachment tags. Empty when any
 * prose remains, so a typed sentence still names the thread. */
export function attachmentOnlyTitle(text: string): string {
  if (text.replace(ATTACHMENT_TAG, " ").trim()) return "";
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(ATTACHMENT_TAG)) {
    const label = attachmentLabel(match[0]);
    if (!label || label === "." || label === ".." || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels.length ? redactSecretsInText(labels.join(", ")) : "";
}

/** What a fresh thread may be named from. Image tags are already gone from
 * the provider text; an attachment-only send still contributes its names. */
export function threadNamingText(submitted: string, providerText: string): string {
  return attachmentOnlyTitle(submitted) || providerText.trim();
}

export type ThreadTitleSource = "first-message" | "conversation";

export function threadTitlePrompt(text: string, source: ThreadTitleSource = "first-message"): string {
  return [
    source === "conversation"
      ? "Name the conversation below by what it is about now."
      : "Name the conversation that begins with the message below.",
    "Reply with only a short title: 3 to 6 words, plain text, no quotes, no trailing period.",
    source === "conversation" ? "Conversation:" : "Message:",
    text.trim().slice(0, TITLE_INPUT_MAX_CHARS),
  ].join("\n");
}

/** The newest user and bot text lines, oldest first, one per line and each
 * clipped, until the next line would pass the input cap. Attachment markup
 * and secrets are scrubbed before anything leaves this machine. Empty when
 * the thread has nothing a title could be drawn from. */
export function titleConversationExcerpt(messages: readonly Message[]): string {
  const lines: string[] = [];
  let length = 0;
  for (let index = messages.length - 1; index >= 0 && lines.length < EXCERPT_MAX_MESSAGES; index--) {
    const message = messages[index]!;
    // peer asides and still-queued lines are not the conversation yet
    if (message.kind !== "text" || !message.text || message.aside || message.queued) continue;
    const stripped = redactSecretsInText(message.text.replace(ATTACHMENT_TAG, " ")).replace(/\s+/g, " ").trim();
    const text = stripped || attachmentOnlyTitle(message.text);
    if (!text) continue;
    const clipped = text.length > EXCERPT_LINE_MAX_CHARS ? `${text.slice(0, EXCERPT_LINE_MAX_CHARS - 1)}…` : text;
    const line = `${message.role === "user" ? "User" : "Bot"}: ${clipped}`;
    if (length + line.length + 1 > TITLE_INPUT_MAX_CHARS) break;
    lines.push(line);
    length += line.length + 1;
  }
  return lines.reverse().join("\n");
}
