import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TurnPresence } from "./TurnPresence";
import type { RetryActivity } from "@/lib/live-activity";

const retry: RetryActivity = { attempt: 2, max: 3, delaySec: 5, startedAt: 0 };

describe("TurnPresence retry countdown", () => {
  it("shows the attempt and the seconds still left instead of Thinking", () => {
    const markup = renderToStaticMarkup(createElement(TurnPresence, {
      avatar: createElement("span", null, "bot"),
      visible: true,
      label: "Thinking",
      since: 1_000,
      retry,
    }));
    expect(markup).toContain("Retrying, attempt 2/3, 5s");
    expect(markup).not.toContain("Thinking");
  });
});
