// Plus vs official identity. Keep electron/plus-build.mjs in step with this
// file. The packaged app sets openmausbotPlus via
// electron-builder extraMetadata; a local Plus build can also export
// OMB_PLUS=1. Neither is set for the official app, so this file is a no-op
// there. Electron userData follows the product name. Server data stays
// ~/.openmausbot either way (electron/main.mjs desktopDataDir).
const fs = require("node:fs");
const path = require("node:path");

const OFFICIAL_BUNDLE_ID = "com.openmausbot.app";
const PLUS_BUNDLE_ID = "com.openmausbot.app.plus";
const OFFICIAL_DESKTOP_NAME = "com.openmausbot.app.desktop";
const PLUS_DESKTOP_NAME = "com.openmausbot.app.plus.desktop";
const OFFICIAL_PRODUCT_NAME = "OpenMausBot";
const PLUS_PRODUCT_NAME = "OpenMausBot Plus";

let packagedPlus = null;

function readPackagedPlus() {
  if (packagedPlus != null) return packagedPlus;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    packagedPlus = pkg.openmausbotPlus === true;
  } catch {
    packagedPlus = false;
  }
  return packagedPlus;
}

function isPlusBuild() {
  return process.env.OMB_PLUS === "1" || readPackagedPlus();
}

function hostBundleId() {
  return isPlusBuild() ? PLUS_BUNDLE_ID : OFFICIAL_BUNDLE_ID;
}

function desktopName() {
  return isPlusBuild() ? PLUS_DESKTOP_NAME : OFFICIAL_DESKTOP_NAME;
}

function productName() {
  return isPlusBuild() ? PLUS_PRODUCT_NAME : OFFICIAL_PRODUCT_NAME;
}

module.exports = {
  OFFICIAL_BUNDLE_ID,
  PLUS_BUNDLE_ID,
  OFFICIAL_DESKTOP_NAME,
  PLUS_DESKTOP_NAME,
  OFFICIAL_PRODUCT_NAME,
  PLUS_PRODUCT_NAME,
  isPlusBuild,
  hostBundleId,
  desktopName,
  productName,
};
