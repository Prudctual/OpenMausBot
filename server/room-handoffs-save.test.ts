import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RoomHandoffHooks } from "./room-handoffs.ts";
import { removeTempDir } from "./testing/cleanup.ts";

// Spied, not replaced: every call still reaches the real filesystem, and the
// test can count the fsyncs a handoff save costs. Load a fresh copy so
// room-handoffs and atomic see the spies.
vi.mock("node:fs", { spy: true });
vi.resetModules();
const spied = await import("node:fs");
const { RoomHandoffs } = await import("./room-handoffs.ts");

const flush = () => new Promise<void>(resolve => setImmediate(resolve));

describe("room handoff saves", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map(dir => removeTempDir(dir)));
  });

  function engine(run?: RoomHandoffHooks["run"]) {
    const dir = mkdtempSync(join(tmpdir(), "room-handoff-save-"));
    dirs.push(dir);
    const hooks: RoomHandoffHooks = {
      validate: () => undefined,
      busy: () => false,
      run: run ?? vi.fn(async () => ({ ok: true, text: "done" })),
      report: vi.fn(),
      changed: () => {},
    };
    return new RoomHandoffs(join(dir, "requests.json"), hooks);
  }

  it("fsyncs every acceptance before it returns", () => {
    const handoffs = engine();
    vi.mocked(spied.fsyncSync).mockClear();
    const source = { botId: "chief", threadId: "chief" };
    handoffs.enqueue(source, "turn", undefined, { botId: "a", threadId: "a" }, "a", "A");
    handoffs.enqueue(source, "turn", undefined, { botId: "b", threadId: "b" }, "b", "B");
    handoffs.enqueue(source, "turn", undefined, { botId: "c", threadId: "c" }, "c", "C");
    expect(spied.fsyncSync).toHaveBeenCalledTimes(3);
  });

  it("keeps a user stop on disk immediately", () => {
    const handoffs = engine();
    handoffs.enqueue({ groupId: "C", threadId: "C-thread", botId: "C-bot" }, "cancel", undefined, { groupId: "D", threadId: "D-thread", botId: "D-bot" }, "work", "cancel work");
    vi.mocked(spied.fsyncSync).mockClear();
    handoffs.cancelRoom("C");
    expect(spied.fsyncSync).toHaveBeenCalledTimes(2);
  });

  it("coalesces one tick and the settlements that resolve in that turn", async () => {
    const handoffs = engine();
    const source = { botId: "chief", threadId: "chief" };
    handoffs.enqueue(source, "turn", undefined, { botId: "a", threadId: "a" }, "a", "A");
    handoffs.enqueue(source, "turn", undefined, { botId: "b", threadId: "b" }, "b", "B");
    handoffs.enqueue(source, "turn", undefined, { botId: "c", threadId: "c" }, "c", "C");
    vi.mocked(spied.fsyncSync).mockClear();
    handoffs.sourceSettled("turn", true);
    handoffs.tick();
    // sourceSettled is its own accept-style write. Starting the three children
    // is one write, not three.
    expect(spied.fsyncSync).toHaveBeenCalledTimes(2);
    await flush();
    expect(spied.fsyncSync).toHaveBeenCalledTimes(3);
    expect([...handoffs.nodes.values()].filter(node => node.parentId).every(node => node.status === "completed")).toBe(true);
  });
});
