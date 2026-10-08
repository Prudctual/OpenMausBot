import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

test("official identity unless OMB_PLUS=1", () => {
  const previous = process.env.OMB_PLUS;
  delete process.env.OMB_PLUS;
  const plus = require("./plus-build.cjs");
  try {
    assert.equal(plus.isPlusBuild(), false);
    assert.equal(plus.hostBundleId(), "com.openmausbot.app");
    assert.equal(plus.desktopName(), "com.openmausbot.app.desktop");
    assert.equal(plus.productName(), "OpenMausBot");
    process.env.OMB_PLUS = "1";
    assert.equal(plus.isPlusBuild(), true);
    assert.equal(plus.hostBundleId(), "com.openmausbot.app.plus");
    assert.equal(plus.desktopName(), "com.openmausbot.app.plus.desktop");
    assert.equal(plus.productName(), "OpenMausBot Plus");
  } finally {
    if (previous === undefined) delete process.env.OMB_PLUS;
    else process.env.OMB_PLUS = previous;
  }
});
