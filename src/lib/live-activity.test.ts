import { describe, expect, it } from "vitest";

import { liveActivityLabel, parseRetryActivity, retryCountdownText, retrySecondsRemaining } from "./live-activity";
import type { Message } from "@/state/store";

const activity = (name: string, extra: Partial<NonNullable<Message["tool"]>> = {}): Message => ({
  id: "activity",
  at: 1,
  role: "bot",
  kind: "activity",
  tool: { ...extra, name },
});

describe("liveActivityLabel", () => {
  it("shows thinking before a tool starts and after it settles", () => {
    expect(liveActivityLabel()).toBe("Thinking");
    expect(liveActivityLabel(activity("Read", { ok: true }))).toBe("Thinking");
  });

  it("uses the server's narration for the exact live action", () => {
    expect(liveActivityLabel(activity("Edit", { spoken: "editing a file" }))).toBe(
      "Editing a file",
    );
  });

  it("maps common native and MCP tool names when narration is unavailable", () => {
    expect(liveActivityLabel(activity("Bash: pnpm test"))).toBe("Running a command");
    expect(liveActivityLabel(activity("mcp__computer__click"))).toBe("Using the computer");
    expect(liveActivityLabel(activity("web_search"))).toBe("Searching the web");
    expect(liveActivityLabel(activity("delegate_bot"))).toBe("Handing off a task");
    expect(liveActivityLabel(activity("ask_bot"))).toBe("Asking a teammate");
    expect(liveActivityLabel(activity("list_rooms"))).toBe("Checking the groups");
    expect(liveActivityLabel(activity("post_to_room"))).toBe("Posting in a group");
  });

  it("names a retry backoff even after the chip is marked done", () => {
    const chip = activity("retrying — attempt 2/3 in 5s — overloaded", { ok: true });
    chip.at = 10_000;
    expect(liveActivityLabel(chip)).toBe("Retrying, attempt 2/3");
    expect(parseRetryActivity(chip)).toEqual({ attempt: 2, max: 3, delaySec: 5, startedAt: 10_000 });
    expect(retrySecondsRemaining(parseRetryActivity(chip)!, 12_400)).toBe(3);
    expect(retryCountdownText(parseRetryActivity(chip)!, 12_400)).toBe("Retrying, attempt 2/3, 3s");
    expect(retrySecondsRemaining({ delaySec: 5, startedAt: 0 }, 12_400)).toBe(5);
    expect(retrySecondsRemaining(parseRetryActivity(chip)!, 20_000)).toBe(0);
  });

  it("leaves an ordinary finished tool as thinking", () => {
    expect(parseRetryActivity(activity("Read", { ok: true }))).toBeNull();
    expect(liveActivityLabel(activity("retrying the upload", { ok: true }))).toBe("Thinking");
  });

  it("does not present bot-to-bot communication chips as the active action", () => {
    expect(
      liveActivityLabel({
        ...activity("ask_bot"),
        comm: { groupId: "room", withBotId: "bot", withName: "Peer", withColor: "blue" },
      }),
    ).toBe("Thinking");
  });
});
