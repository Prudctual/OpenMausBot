// @vitest-environment happy-dom
import { createElement, type RefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { citationAttachment } from "@/lib/citations";
import { CitationBadge, CitationSelectionToolbar } from "./CitationUI";

const captured = vi.hoisted(() => ({
  text: "hello",
}));

vi.mock("@/lib/citations-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/citations-dom")>();
  return {
    ...actual,
    captureCitationSelection: () => ({
      source: {
        dataset: {
          citationSource: "message-1",
          citationOwnerType: "bot",
          citationOwner: "bot-1",
          citationThread: "thread-1",
        },
      },
      selector: { text: captured.text, start: 0, end: captured.text.length, prefix: "", suffix: "" },
      range: {
        getClientRects: () => ({ length: 1, item: () => ({ left: 8, top: 8, bottom: 20 }) }),
        getBoundingClientRect: () => ({ left: 8, top: 8, bottom: 20 }),
      },
    }),
    citationTabShortcut: () => ({ reset() {}, handle() {} }),
  };
});

describe("citation labels", () => {
  let root: Root | undefined;
  afterEach(() => {
    act(() => root?.unmount());
    root = undefined;
    document.body.innerHTML = "";
    captured.text = "hello";
  });

  async function render(node: ReturnType<typeof createElement>) {
    act(() => root?.unmount());
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => { root!.render(node); });
    return host;
  }

  it("offers cite, comment, remove, and details in the catalog language", async () => {
    const citation = citationAttachment(
      { ownerType: "bot", ownerId: "bot-1", threadId: "thread-1", messageId: "message-1" },
      { text: "hello quote", start: 0, end: 11, prefix: "", suffix: "" },
    );
    const host = await render(createElement(CitationBadge, {
      citation,
      onRemove: () => {},
      onChange: () => {},
    }));
    expect(host.querySelector("[aria-label='Remove citation']")).toBeTruthy();
    await act(async () => {
      host.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(document.body.querySelector("[aria-label='Citation details']")).toBeTruthy();

    const viewport = document.createElement("div");
    document.body.append(viewport);
    const viewportRef = { current: viewport } as RefObject<HTMLElement | null>;
    await render(createElement(CitationSelectionToolbar, { viewportRef, onAdd: () => {} }));
    await act(async () => { document.dispatchEvent(new Event("selectionchange")); });
    const cite = document.body.querySelector("[aria-label='Cite selected text']");
    expect(cite?.textContent).toContain("Cite");
    await act(async () => { cite!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(document.body.querySelector("[aria-label='Comment on citation']")).toBeTruthy();
    expect(document.body.querySelector("[aria-label='Comment on selected text']")).toBeTruthy();
    expect(document.body.querySelector("textarea")?.getAttribute("placeholder")).toBe("Add an optional comment…");
  });

  it("asks for a shorter selection when the quote is too long", async () => {
    captured.text = "x".repeat(20_000);
    const viewport = document.createElement("div");
    document.body.append(viewport);
    const viewportRef = { current: viewport } as RefObject<HTMLElement | null>;
    await render(createElement(CitationSelectionToolbar, { viewportRef, onAdd: () => {} }));
    await act(async () => { document.dispatchEvent(new Event("selectionchange")); });
    const tooLong = document.body.querySelector("[aria-label='Selection is too long to cite']");
    expect(tooLong?.textContent).toContain("Shorten selection");
  });
});
