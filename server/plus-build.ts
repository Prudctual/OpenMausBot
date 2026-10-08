// Packaged Plus drops plus-build.json beside the bundled server (see
// scripts/write-plus-marker.mjs). The desktop parent also sets OMB_PLUS=1.
// Absent both, this checkout behaves as the official app.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const OFFICIAL_HOST_BUNDLE_ID = "com.openmausbot.app";
export const PLUS_HOST_BUNDLE_ID = "com.openmausbot.app.plus";

function markerSaysPlus(): boolean {
  try {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let depth = 0; depth < 4; depth += 1) {
      const marker = join(dir, "plus-build.json");
      if (existsSync(marker)) {
        return JSON.parse(readFileSync(marker, "utf8")).plus === true;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    return false;
  }
  return false;
}

export function isPlusBuild(): boolean {
  return process.env.OMB_PLUS === "1" || markerSaysPlus();
}

/** Computer-use may name either bundle. A foreign id is still rejected. */
export function acceptedHostBundleIds(): ReadonlySet<string> {
  return isPlusBuild()
    ? new Set([OFFICIAL_HOST_BUNDLE_ID, PLUS_HOST_BUNDLE_ID])
    : new Set([OFFICIAL_HOST_BUNDLE_ID]);
}
