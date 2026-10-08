// ESM twin of plus-build.cjs. updater.test.mjs replaces node:module's
// createRequire, so this file must not load the CJS copy that way.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const OFFICIAL_BUNDLE_ID = "com.openmausbot.app";
export const PLUS_BUNDLE_ID = "com.openmausbot.app.plus";
export const OFFICIAL_DESKTOP_NAME = "com.openmausbot.app.desktop";
export const PLUS_DESKTOP_NAME = "com.openmausbot.app.plus.desktop";
export const OFFICIAL_PRODUCT_NAME = "OpenMausBot";
export const PLUS_PRODUCT_NAME = "OpenMausBot Plus";

let packagedPlus = null;

function readPackagedPlus() {
  if (packagedPlus != null) return packagedPlus;
  try {
    const pkg = JSON.parse(readFileSync(join(fileURLToPath(new URL(".", import.meta.url)), "..", "package.json"), "utf8"));
    packagedPlus = pkg.openmausbotPlus === true;
  } catch {
    packagedPlus = false;
  }
  return packagedPlus;
}

export function isPlusBuild() {
  return process.env.OMB_PLUS === "1" || readPackagedPlus();
}

export function hostBundleId() {
  return isPlusBuild() ? PLUS_BUNDLE_ID : OFFICIAL_BUNDLE_ID;
}

export function desktopName() {
  return isPlusBuild() ? PLUS_DESKTOP_NAME : OFFICIAL_DESKTOP_NAME;
}

export function productName() {
  return isPlusBuild() ? PLUS_PRODUCT_NAME : OFFICIAL_PRODUCT_NAME;
}
