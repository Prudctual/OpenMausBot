// @vitest-environment happy-dom
// A room's rows re-render only when their own message changes, the same
// rule ChatView.rows.test.ts pins for a 1:1 chat. Counted through the leaf
// each row draws.
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AppState, Bot, Group, Message } from "@/state/store";

const renders = vi.hoisted(() => ({ botText: 0, userText: 0, toolChip: 0 }));
vi.mock("./ChatMarkdown", async (importOriginal) => ({
  ...await importOriginal<typeof import("./ChatMarkdown")>(),
  ChatMarkdown: ({ text }: { text: string }) => {
    renders.botText++;
    return createElement("p", null, text);
  },
}));
vi.mock("./ThreadRefs", async (importOriginal) => ({
  ...await importOriginal<typeof import("./ThreadRefs")>(),
  ThreadRefText: ({ text }: { text: string }) => {
    renders.userText++;
    return createElement("span", null, text);
  },
}));
vi.mock("./ToolActivity", async (importOriginal) => ({
  ...await importOriginal<typeof import("./ToolActivity")>(),
  ToolActivity: ({ tool }: { tool: { name: string } }) => {
    renders.toolChip++;
    return createElement("span", null, tool.name);
  },
}));
vi.mock("./DesktopCapabilities", async (importOriginal) => ({
  ...await importOriginal<typeof import("./DesktopCapabilities")>(),
  useDesktopCapabilities: () => ({ capabilities: { dictation: { available: false }, host: { packaged: true, platform: "other" }, localComputer: { available: false, reasonCode: "x", message: "" } }, ready: true }),
  useCaptionChrome: () => ({}),
}));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("./ConversationTurnLimit", () => ({ ConversationTurnLimit: () => null }));

const { GroupView } = await import("./GroupView");
const { BotEditorStore, initialState, reducer } = await import("@/state/store");

const message = (id: string, fields: Partial<Message>): Message =>
  ({ id, role: "bot", kind: "text", at: 1_000 + Number(id.slice(1)), ...fields });
const messages: Message[] = [
  message("m0", { role: "user", text: "Question" }),
  message("m1", { kind: "activity", tool: { name: "Read file", ok: true } }),
  message("m2", { text: "Answer" }),
];
const running = messages[1]!;

const room = (extra: Partial<Group> = {}): Group => ({
  id: "room", threadId: "room-thread", name: "Launch", memberIds: ["lead"],
  defaultResponder: { kind: "member", botId: "lead" }, bulletin: "", unread: false,
  createdAt: 1, setupCompletedAt: 1, messages, ...extra,
});
const lead = { id: "lead", name: "Lead", color: "blue" } as Bot;
const scout = { id: "scout", name: "Scout", color: "green" } as Bot;

let state: AppState = {
  ...initialState,
  connected: true,
  selectedId: "room",
  bots: [lead, scout],
  groups: [room()],
  config: { features: { showToolCalls: true } } as AppState["config"],
};
const dispatch = vi.fn();
let root: Root;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
async function draw() {
  const value = { state, dispatch, flushBotPatches: async () => null, refreshInstances: async () => {}, refreshModels: async () => {} };
  const children = createElement(GroupView, { group: state.groups[0]! });
  flushSync(() => root.render(createElement(BotEditorStore, { value, children })));
  await settle();
}
async function rowRendersAfter(change: (current: AppState) => AppState) {
  renders.botText = renders.userText = renders.toolChip = 0;
  state = change(state);
  await draw();
  return { ...renders };
}

beforeAll(async () => {
  vi.stubGlobal("fetch", () => new Promise(() => {}));
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await draw();
  await settle();
});
afterAll(() => {
  root.unmount();
  vi.unstubAllGlobals();
});

describe("room transcript rows", () => {
  it("draws every row once on mount", () => {
    expect(document.body.textContent).toContain("Question");
    expect(document.body.textContent).toContain("Answer");
    expect(document.body.textContent).toContain("Read file");
  });

  it("renders no row when another bot changes", async () => {
    expect(await rowRendersAfter((current) => reducer(current, { type: "botPatched", bot: { ...scout, busy: true } })))
      .toEqual({ botText: 0, userText: 0, toolChip: 0 });
  });

  it("renders only the tool chip that changed", async () => {
    expect(await rowRendersAfter((current) => reducer(current, {
      type: "messagePatched", threadId: "room-thread", message: { ...running, tool: { name: "Read file, page 2", ok: true } },
    }))).toEqual({ botText: 0, userText: 0, toolChip: 1 });
    expect(document.body.textContent).toContain("Read file, page 2");
  });
});
