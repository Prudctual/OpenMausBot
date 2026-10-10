// Launch the packaged Plus app on the macOS runner with an empty home and the
// app's own smoke hook (OMB_SMOKE_TEST): the real preload bridge, the bundled
// server's /api/health and an owner mutation must all answer, then the window
// closes and the app must quit by itself.
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const app = process.argv[2];
if (!app) throw new Error("usage: smoke-plus-mac-app.mjs <path to .app>");
const executable = path.join(app, "Contents", "MacOS", path.basename(app, ".app"));
const home = mkdtempSync(path.join(tmpdir(), "omb-plus-smoke-"));
mkdirSync(path.join(home, ".openmausbot"), { recursive: true });
const child = spawn(executable, [], {
  env: { ...process.env, HOME: home, OMB_SMOKE_TEST: "1", ELECTRON_ENABLE_LOGGING: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
const result = await new Promise((resolve) => {
  const timer = setTimeout(() => resolve({ ok: false, why: "timed out after 180s" }), 180_000);
  const onData = (chunk) => {
    output += chunk;
    process.stdout.write(chunk);
    const ready = output.match(/\[smoke\] renderer-ready (\{.*\})/);
    if (ready) { clearTimeout(timer); resolve({ ok: true, detail: JSON.parse(ready[1]) }); }
    if (output.includes("[smoke] renderer-failed")) { clearTimeout(timer); resolve({ ok: false, why: "renderer-failed" }); }
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("exit", (code) => { clearTimeout(timer); resolve({ ok: false, why: `exited early with ${code}` }); });
});
if (!result.ok) {
  child.kill("SIGKILL");
  console.error(`::error::Plus app smoke failed: ${result.why}`);
  process.exit(1);
}
const { health, title, location } = result.detail;
console.log(`smoke ok: title=${title} location=${location} health=${JSON.stringify(health).slice(0, 300)}`);
// After the window closes the macOS app stays in the dock; quit it.
setTimeout(() => child.kill("SIGTERM"), 3_000);
const exited = await new Promise((resolve) => {
  const timer = setTimeout(() => resolve(false), 30_000);
  child.on("exit", () => { clearTimeout(timer); resolve(true); });
});
if (!exited) {
  child.kill("SIGKILL");
  console.error("::error::Plus app did not quit on SIGTERM");
  process.exit(1);
}
console.log("Plus app quit cleanly");
