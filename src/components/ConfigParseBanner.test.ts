import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { configStatusFromFrame, type ConfigStatus, type ConfigStatusFrame } from "@/state/store";
import { ConfigParseBanner, configParseWarnings } from "./ConfigParseBanner";

const config = (ignoredFiles?: ConfigStatus["ignoredFiles"]): ConfigStatus =>
  ({ ignoredFiles }) as ConfigStatus;

describe("config parse banner", () => {
  it("is silent when every settings file loaded", () => {
    expect(configParseWarnings(null)).toEqual([]);
    expect(configParseWarnings(config([]))).toEqual([]);
    expect(renderToStaticMarkup(createElement(ConfigParseBanner, { config: config([]) }))).toBe("");
  });

  it("shows the file path and a copy button", () => {
    const files = [{ path: "/Users/ada/.openmausbot/config.json", reason: "invalid JSON" }];
    const html = renderToStaticMarkup(createElement(ConfigParseBanner, { config: config(files) }));
    expect(html).toContain("/Users/ada/.openmausbot/config.json");
    expect(html).toContain("invalid JSON");
    expect(html).toContain("Copy path");
    expect(html).toContain('role="status"');
  });

  it("keeps the warning when a live config frame arrives", () => {
    const frame = { ignoredFiles: [{ path: "config.json", reason: "invalid JSON" }] } as ConfigStatusFrame;
    expect(configStatusFromFrame(frame).ignoredFiles).toEqual(frame.ignoredFiles);
    expect(configStatusFromFrame({} as ConfigStatusFrame)).not.toHaveProperty("ignoredFiles");
  });
});
