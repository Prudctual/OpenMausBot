import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageTime } from "./MessageTime";

describe("MessageTime", () => {
  it("shows a relative reply time and keeps the full date on hover", () => {
    const now = Date.parse("2026-10-08T12:05:00Z");
    const at = now - 5 * 60_000;
    const html = renderToStaticMarkup(createElement(MessageTime, { at, now, className: "stamp" }));
    expect(html).toContain("5 min ago");
    expect(html).toContain(`title="${new Date(at).toLocaleString()}"`);
    expect(html).not.toContain("5m ago");
  });
});
