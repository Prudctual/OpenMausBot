// @vitest-environment happy-dom
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bot, Group, Message } from "@/state/store";

const fixture = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock("@/state/store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/state/store")>();
  return { ...original, useStore: () => ({
    state: { ...original.initialState, bots: [] as Bot[] },
    dispatch: fixture.dispatch,
  }) };
});
vi.mock("./DesktopCapabilities", async (importOriginal) => ({
  ...await importOriginal<typeof import("./DesktopCapabilities")>(),
  useDesktopCapabilities: () => ({ capabilities: { dictation: { available: false }, host: { packaged: true, platform: "other" }, localComputer: { available: false, reasonCode: "x", message: "" } }, ready: true }),
  useCaptionChrome: () => ({}),
}));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

const { Transcript } = await import("./GroupView");

const CANCELLED = "The request was cancelled by the client.";
const room: Group = {
  id: "room", threadId: "room-thread", name: "Launch", memberIds: ["lead"],
  defaultResponder: { kind: "member", botId: "lead" }, bulletin: "", unread: false,
  createdAt: 1, messages: [],
};
const lead = { id: "lead", name: "Lead", color: "blue" } as Bot;
const ask: Message = { id: "ask", role: "user", kind: "text", at: 1, text: "Try the new model" };
const cancel: Message = {
  id: "cancel", role: "bot", kind: "text", at: 2, text: CANCELLED,
  from: { botId: "lead", name: "Lead", color: "blue" },
};

let host: HTMLDivElement;
let root: Root;
const render = (messages: Message[], group: Group = room) => flushSync(() => root.render(createElement(Transcript, {
  group, members: [lead], locale: "en", messages, transcript: messages, onReply: () => {},
})));
const retry = () => [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Retry"));

beforeEach(() => {
  fixture.dispatch.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  flushSync(() => root.unmount());
  host.remove();
});

describe("a cancelled turn in a room", () => {
  it("renders a muted stop and resends the same message on the room's send path", () => {
    render([ask, cancel]);
    expect(host.textContent).toContain("Stopped");
    expect(host.textContent).not.toContain(CANCELLED);
    expect(host.innerHTML).not.toContain("border-danger");
    flushSync(() => retry()!.click());
    expect(fixture.dispatch).toHaveBeenCalledWith({
      type: "sendGroup",
      groupId: "room",
      text: "Try the new model",
      threadId: "room-thread",
      mode: "chat",
    });
  });

  it("hides Retry while the room is busy and after a newer message", () => {
    render([ask, cancel], { ...room, busyBotId: "lead" });
    expect(host.textContent).toContain("Stopped");
    expect(retry()).toBeUndefined();
    render([ask, cancel, { id: "next", role: "user", kind: "text", at: 3, text: "Something else" }]);
    expect(retry()).toBeUndefined();
  });
});
