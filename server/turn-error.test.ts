import { describe, expect, it } from "vitest";

import { QUOTA_EXHAUSTED_MESSAGE } from "../shared/quota-message.ts";
import { turnErrorText } from "./turn-error.ts";

describe("turnErrorText", () => {
  it("replaces a raw exhausted quota and leaves an actionable sentence alone", () => {
    expect(turnErrorText("xAI HTTP 429: insufficient credits")).toBe(QUOTA_EXHAUSTED_MESSAGE);
    expect(turnErrorText("quota exceeded for this plan")).toBe(QUOTA_EXHAUSTED_MESSAGE);
    expect(turnErrorText("Your credits balance is too low")).toBe(QUOTA_EXHAUSTED_MESSAGE);
    expect(turnErrorText("You've hit your usage limit for this session. Try again at 7pm.")).toBe(
      "You've hit your usage limit for this session. Try again at 7pm.",
    );
    expect(turnErrorText("Your OpenCode Zen balance has run out. Add credit at opencode.ai, or choose one of Zen's free models for this bot.")).toBe(
      "Your OpenCode Zen balance has run out. Add credit at opencode.ai, or choose one of Zen's free models for this bot.",
    );
    expect(turnErrorText("subscription_sharing_usage_limit_exceeded: Your ChatGPT plan usage limit was reached. Manage usage in ChatGPT Settings, or explicitly choose another provider.")).toBe(
      "subscription_sharing_usage_limit_exceeded: Your ChatGPT plan usage limit was reached. Manage usage in ChatGPT Settings, or explicitly choose another provider.",
    );
    expect(turnErrorText(QUOTA_EXHAUSTED_MESSAGE)).toBe(QUOTA_EXHAUSTED_MESSAGE);
    expect(turnErrorText("HTTP 429: too many requests")).toBe("HTTP 429: too many requests");
    expect(turnErrorText("HTTP 429: RESOURCE_EXHAUSTED")).toBe("HTTP 429: RESOURCE_EXHAUSTED");
  });
});
