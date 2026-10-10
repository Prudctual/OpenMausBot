import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions, pickPlusRelease } from "./plus-updater.mjs";

test("plus versions order by base, then plus build", () => {
  assert.ok(compareVersions("0.1.104-plus.2", "0.1.104-plus.1") > 0);
  assert.ok(compareVersions("0.1.105-plus.1", "0.1.104-plus.9") > 0);
  assert.ok(compareVersions("0.1.104-plus.10", "0.1.104-plus.9") > 0);
  assert.equal(compareVersions("0.1.104-plus.1", "0.1.104-plus.1"), 0);
  assert.ok(compareVersions("0.1.104-plus.1", "0.1.101") > 0);
});

test("only published plus-* releases with a manifest are followed", () => {
  const asset = { name: "plus-update.json", browser_download_url: "https://github.com/Prudctual/OpenMausBot/releases/download/plus-0.1.104/plus-update.json" };
  const picked = pickPlusRelease([
    { tag_name: "v0.1.110", published_at: "2026-10-12", assets: [asset] },
    { tag_name: "plus-0.1.105", draft: true, published_at: "2026-10-11", assets: [asset] },
    { tag_name: "plus-0.1.101", published_at: "2026-10-08", assets: [] },
    { tag_name: "plus-0.1.104", published_at: "2026-10-10", assets: [asset] },
  ]);
  assert.equal(picked.release.tag_name, "plus-0.1.104");
  assert.equal(pickPlusRelease([{ tag_name: "v1", assets: [asset] }]), null);
});
