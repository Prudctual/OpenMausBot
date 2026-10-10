// Fails when the official electron-builder.yml ships a macOS resource that
// the standalone electron-builder.plus.yml does not, so a Plus rebuild on a
// newer upstream cannot silently drop a new bundled tool (duckdb did once).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const builderLib = require.resolve("app-builder-lib/package.json", { paths: [require.resolve("electron-builder")] });
const yaml = require(require.resolve("js-yaml", { paths: [builderLib] }));
const load = (file) => yaml.load(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const official = load("electron-builder.yml");
const plus = load("electron-builder.plus.yml");
const froms = (list) => (list ?? []).map((entry) => (typeof entry === "string" ? entry : entry.from));
const missing = [
  ...froms(official.mac?.extraResources).filter((from) => !froms(plus.mac?.extraResources).includes(from)).map((f) => `mac: ${f}`),
  ...froms(official.extraResources).filter((from) => !froms(plus.extraResources).includes(from)).map((f) => `top: ${f}`),
];
if (plus.publish != null) missing.push("plus publish must stay null (no app-update.yml)");
if (missing.length) {
  console.error(`electron-builder.plus.yml is out of date:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}
console.log("plus builder config covers every official macOS resource");
