// @vitest-environment happy-dom
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ connected: true }));
vi.mock("@/state/store", () => ({
  useStore: () => ({ state: { connected: fixture.connected } }),
}));

const { RECONNECTING_DELAY_MS, ReconnectingLine, resetReconnectingMemory } = await import("./ReconnectingLine");

describe("ReconnectingLine", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    resetReconnectingMemory();
    fixture.connected = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  const render = () => {
    act(() => { root.render(createElement(ReconnectingLine)); });
  };

  it("stays quiet during a brief drop and while the stream has never been up", () => {
    fixture.connected = false;
    render();
    act(() => { vi.advanceTimersByTime(RECONNECTING_DELAY_MS); });
    expect(container.textContent).toBe("");

    fixture.connected = true;
    render();
    fixture.connected = false;
    render();
    act(() => { vi.advanceTimersByTime(RECONNECTING_DELAY_MS - 1); });
    expect(container.textContent).toBe("");
    fixture.connected = true;
    render();
    act(() => { vi.advanceTimersByTime(RECONNECTING_DELAY_MS); });
    expect(container.textContent).toBe("");
  });

  it("says it is reconnecting only after the delay, then hides when the stream returns", () => {
    render();
    fixture.connected = false;
    render();
    act(() => { vi.advanceTimersByTime(RECONNECTING_DELAY_MS); });
    expect(container.textContent).toBe("Reconnecting…");
    expect(container.querySelector("[role=status]")).not.toBeNull();
    fixture.connected = true;
    render();
    expect(container.textContent).toBe("");
  });

  it("is the line both the chat and the room render", () => {
    for (const file of ["ChatView.tsx", "GroupView.tsx"]) {
      expect(readFileSync(`src/components/${file}`, "utf8")).toContain("<ReconnectingLine />");
    }
  });
});
