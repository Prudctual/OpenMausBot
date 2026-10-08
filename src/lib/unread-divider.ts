// Where the New divider goes when a conversation opens unread.
//
// Read state is one flag per conversation (Task.unread, Group.unread), so it
// says that something arrived while the person was away, not where. The
// person's own newest line is the last point they certainly saw: the divider
// sits above the first line someone else wrote after it. A conversation the
// person never wrote in has no such point and gets no divider, and neither
// does one where nothing came in after them.
import { peerLine } from "@/lib/peer-message";
import type { Message } from "@/state/store";

type Line = Pick<Message, "id" | "role" | "text" | "peerAsk">;

/** A user-role line the person wrote, not one another bot delivered. */
const fromPerson = (message: Line) => message.role === "user" && !peerLine(message);

/** The first unread message of a conversation opened unread, or null. */
export function firstUnreadMessageId(messages: readonly Line[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (fromPerson(messages[i]!)) return messages[i + 1]?.id ?? null;
  }
  return null;
}

/** The divider's message and every one after it, or null when the mounted
 * rows do not hold it. A list puts the divider above the first row that
 * draws one of these, so a hidden row under it does not lose it. */
export function unreadMessageIds(messages: readonly Pick<Message, "id">[], messageId: string | null): ReadonlySet<string> | null {
  if (!messageId) return null;
  const at = messages.findIndex((message) => message.id === messageId);
  return at < 0 ? null : new Set(messages.slice(at).map((message) => message.id));
}

/** Whether the conversation shown for this bot opens unread. A hidden
 * routine run is not a conversation, so it never does (#2007). */
export function threadOpensUnread(bot: {
  threadId: string;
  unread?: boolean;
  tasks?: ReadonlyArray<{ threadId: string; unread?: boolean; routineRunId?: string }> | null;
}): boolean {
  const task = bot.tasks?.find((candidate) => candidate.threadId === bot.threadId);
  if (task?.routineRunId) return false;
  return Boolean(task?.unread ?? bot.unread);
}

/** How long the divider stays once the person has caught up, then how long
 * it takes to fade and fold away. */
export const UNREAD_DIVIDER_LINGER_MS = 1200;
export const UNREAD_DIVIDER_FADE_MS = 480;
