// @vitest-environment happy-dom
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/state/store";

const fixture = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock("@/state/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/state/store")>()),
  useStore: () => ({ state: { bots: [] }, dispatch: fixture.dispatch }),
}));

const { OptionCard } = await import("./OptionCard");

const message: Message = {
  id: "quiz",
  role: "bot",
  kind: "options",
  at: 1,
  card: { title: "Pick one", subtitle: "", options: ["A thing"] },
};

describe("composer pickers and composing Enter", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    fixture.dispatch.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("does not submit a custom answer while an IME composition is confirming", () => {
    act(() => { root.render(createElement(OptionCard, { botId: "atlas", message })); });
    const input = container.querySelector("input");
    expect(input).not.toBeNull();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "مرحبا");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, isComposing: true }));
    });
    expect(fixture.dispatch).not.toHaveBeenCalled();
    act(() => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    expect(fixture.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "answerCard", answer: "مرحبا" }));
  });

  it("links the slash and mention lists to the composer and ignores a composing confirm there too", () => {
    const source = readFileSync("src/components/Composer.tsx", "utf8");
    expect(source).toContain('id="composer-commands"');
    expect(source).toContain('id="composer-mentions"');
    expect(source).toContain('role="combobox"');
    expect(source).toContain("aria-expanded={commandMotion.shown || mentionMotion.shown}");
    expect(source).toContain('aria-controls={commandMotion.shown ? "composer-commands" : mentionMotion.shown ? "composer-mentions" : undefined}');
    expect(source).toContain("aria-activedescendant=");
    expect(source).toContain('aria-autocomplete="list"');
    expect(source).toContain('id={`composer-command-${command.id}`}');
    expect(source).toContain('id={`composer-mention-${peer.id}`}');
    const confirms = source.match(/\(e\.key === "Enter" \|\| e\.key === "Tab"\) && !e\.nativeEvent\.isComposing/g) ?? [];
    expect(confirms).toHaveLength(2);
    expect(readFileSync("src/components/QuestionCard.tsx", "utf8")).toContain('event.key === "Enter" && !event.nativeEvent.isComposing && complete');
  });
});
