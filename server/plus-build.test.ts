import { afterEach, describe, expect, it } from "vitest";

import { acceptedHostBundleIds, isPlusBuild } from "./plus-build.ts";

describe("plus build marker", () => {
  const previous = process.env.OMB_PLUS;

  afterEach(() => {
    if (previous === undefined) delete process.env.OMB_PLUS;
    else process.env.OMB_PLUS = previous;
  });

  it("stays official when OMB_PLUS is unset", () => {
    delete process.env.OMB_PLUS;
    expect(isPlusBuild()).toBe(false);
    expect(acceptedHostBundleIds()).toEqual(new Set(["com.openmausbot.app"]));
    expect(acceptedHostBundleIds().has("com.openmausbot.app.plus")).toBe(false);
  });

  it("accepts the official and Plus bundle ids when OMB_PLUS=1", () => {
    process.env.OMB_PLUS = "1";
    expect(isPlusBuild()).toBe(true);
    const ids = acceptedHostBundleIds();
    expect(ids.has("com.openmausbot.app")).toBe(true);
    expect(ids.has("com.openmausbot.app.plus")).toBe(true);
    expect(ids.has("com.example.other")).toBe(false);
  });
});
