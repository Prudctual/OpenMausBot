import { describe, expect, it } from "vitest";
import {
  dictationEndAction,
  dictationLineAction,
  dictationSendPlan,
  dictatedSendText,
  keepSpeechSession,
} from "./dictation-send";

describe("dictation send", () => {
  it("finishes the recognizer before sending while dictation can finish", () => {
    expect(dictationSendPlan(true, true)).toBe("finish-then-send");
    expect(dictationSendPlan(true, false)).toBe("send");
    expect(dictationSendPlan(false, true)).toBe("send");
  });

  it("sends the final utterance and keeps typed text in front of it", () => {
    expect(dictatedSendText("hello", { partial: false, text: "world" }, "hello wor")).toBe(
      "hello world",
    );
    expect(dictatedSendText("", { partial: false, text: "ship it" }, "ship")).toBe("ship it");
    expect(dictatedSendText("", { partial: false, text: "" }, "ship it")).toBe("ship it");
  });

  it("keeps the composer text while the line is still partial", () => {
    expect(dictatedSendText("hello", { partial: true, text: "wor" }, "hello wor")).toBe("hello wor");
    expect(dictationLineAction(true, "", "ship", { partial: true, text: "ship it" })).toEqual({
      type: "update",
      text: "ship it",
    });
  });

  it("sends the final line only when a send is waiting on it", () => {
    expect(dictationLineAction(true, "note", "note hel", { partial: false, text: "hello" })).toEqual({
      type: "send",
      text: "note hello",
    });
    expect(dictationLineAction(false, "", "hello", { partial: false, text: "hello" })).toEqual({
      type: "update",
      text: "hello",
    });
  });

  it("sends the current text if the recognizer ends before a final line", () => {
    expect(dictationEndAction(true)).toBe("send-current");
    expect(dictationEndAction(false)).toBe("stop");
  });

  it("does not stop the helper while a send is waiting for the final line", () => {
    expect(keepSpeechSession(true)).toBe(true);
    expect(keepSpeechSession(false)).toBe(false);
  });
});
