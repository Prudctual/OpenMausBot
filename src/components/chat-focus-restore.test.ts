// The focus handoff is a few lines inside the chat and room views. This reads
// those lines so a later edit cannot drop the composer focus or the keyboard
// timestamp without a test noticing.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chat = readFileSync("src/components/ChatView.tsx", "utf8");
const room = readFileSync("src/components/GroupView.tsx", "utf8");

const between = (source: string, start: string, end: string) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
};

describe("composer focus and keyboard timestamps", () => {
  it("shows a message time while focus is inside the row", () => {
    for (const source of [chat, room]) {
      const stamp = between(source, "tabular-nums text-ink-tertiary", "formatTime");
      expect(stamp).toContain("group-hover:opacity-100");
      expect(stamp).toContain("group-focus-within:opacity-100");
    }
  });

  it("returns focus to the composer after an edit ends, not when the thread changes", () => {
    const editor = between(chat, "const [editingId, setEditingId]", "const lastUserMessage");
    expect(editor).toContain("useEffect(() => setEditingId(null), [bot.id, bot.threadId]);");
    expect(editor).toContain("if (editingId !== null || !returnFocus.current) return;");
    expect(editor).toContain('composerDockRef.current?.querySelector("textarea")?.focus();');
    const cancel = between(chat, "const cancelEdit", "const submitEdit");
    const submit = between(chat, "const submitEdit", "const lastUserMessage");
    expect(cancel).toContain("returnFocus.current = true;");
    expect(cancel).not.toContain("bot.threadId");
    expect(submit).toContain("returnFocus.current = true;");
  });

  it("moves focus to the composer after the jump pill unmounts", () => {
    for (const source of [chat, room]) {
      const jump = between(source, "jumpToLatest();", "chat.jumpToLatestAria");
      expect(jump).toContain("requestAnimationFrame");
      expect(jump).toContain('composerDockRef.current?.querySelector("textarea")?.focus();');
    }
  });
});
