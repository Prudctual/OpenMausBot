// OpenMausBot Plus updates. Plus is ad-hoc signed, and Squirrel.Mac only
// installs an update whose code signature satisfies the running app's
// designated requirement. An ad-hoc requirement is the exact cdhash, so no
// later build can ever satisfy it and electron-updater cannot install one.
// Instead Plus checks the fork's plus-* releases only (never the official
// feed), downloads the arm64 dmg into ~/Downloads, verifies its sha512 and,
// on "Install", opens it so the person drags the app over the old one.
// The official app never reads these releases: its feed is baked to
// milind-soni/OpenMausBot and Plus ships no app-update.yml.
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

export const PLUS_RELEASES_API = "https://api.github.com/repos/Prudctual/OpenMausBot/releases?per_page=30";
export const PLUS_TAG_PREFIX = "plus-";
export const PLUS_MANIFEST = "plus-update.json";
const PLUS_INSTALL_NOTE = "Install opens the downloaded dmg. Quit Plus, drag the new app over the old one, then reopen it.";

/** Compare x.y.z[-pre.n] versions. Prerelease parts compare per dot segment. */
export function compareVersions(a, b) {
  const split = (v) => {
    const text = String(v).replace(/^v/, "");
    const dash = text.indexOf("-");
    const main = dash < 0 ? text : text.slice(0, dash);
    const pre = dash < 0 ? "" : text.slice(dash + 1);
    return { main: main.split(".").map((n) => Number(n) || 0), pre: pre ? pre.split(".") : [] };
  };
  const x = split(a);
  const y = split(b);
  for (let i = 0; i < 3; i++) if ((x.main[i] ?? 0) !== (y.main[i] ?? 0)) return (x.main[i] ?? 0) - (y.main[i] ?? 0);
  if (!x.pre.length || !y.pre.length) return (x.pre.length ? -1 : 0) - (y.pre.length ? -1 : 0);
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn && Number(p) !== Number(q)) return Number(p) - Number(q);
    if (pn !== qn) return pn ? -1 : 1;
    if (p !== q) return p < q ? -1 : 1;
  }
  return 0;
}

/** The newest published plus-* release that carries a manifest, or null. */
export function pickPlusRelease(releases) {
  let best = null;
  for (const release of Array.isArray(releases) ? releases : []) {
    if (!release || release.draft || release.prerelease) continue;
    if (typeof release.tag_name !== "string" || !release.tag_name.startsWith(PLUS_TAG_PREFIX)) continue;
    const manifest = (release.assets ?? []).find((asset) => asset?.name === PLUS_MANIFEST);
    if (!manifest?.browser_download_url) continue;
    if (!best || new Date(release.published_at) > new Date(best.published_at)) best = release;
  }
  return best ? { release: best, manifestUrl: best.assets.find((a) => a.name === PLUS_MANIFEST).browser_download_url } : null;
}

const ALLOWED_HOSTS = new Set(["github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"]);
function trustedUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && ALLOWED_HOSTS.has(parsed.hostname)
      && (parsed.hostname !== "github.com" || parsed.pathname.startsWith("/Prudctual/OpenMausBot/releases/download/plus-"));
  } catch {
    return false;
  }
}

export function createPlusUpdater({ setState, currentVersion, downloadsDir, openPath, logger, fetchImpl = fetch }) {
  let found = null; // { version, url, sha512, size, notes }
  let file = null;
  let busy = false;

  const fetchJson = async (url) => {
    const response = await fetchImpl(url, { headers: { Accept: "application/vnd.github+json", "User-Agent": "OpenMausBot-Plus" } });
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    return response.json();
  };

  async function download(update) {
    const target = join(downloadsDir, update.dmg);
    const partial = `${target}.download`;
    if (existsSync(target) && statSync(target).size === update.size && sha512File(target) === update.sha512) return target;
    setState({ status: "downloading", version: update.version, percent: 0 });
    const response = await fetchImpl(update.url, { headers: { "User-Agent": "OpenMausBot-Plus" } });
    if (!response.ok || !response.body) throw new Error(`download failed (${response.status})`);
    const hash = createHash("sha512");
    const out = createWriteStream(partial, { mode: 0o644 });
    let received = 0;
    let lastPercent = -1;
    try {
      for await (const chunk of response.body) {
        hash.update(chunk);
        received += chunk.length;
        if (!out.write(chunk)) await new Promise((resolve) => out.once("drain", resolve));
        const percent = update.size ? Math.floor((received / update.size) * 100) : 0;
        if (percent !== lastPercent) {
          lastPercent = percent;
          setState({ status: "downloading", version: update.version, percent });
        }
      }
      await new Promise((resolve, reject) => out.end((error) => (error ? reject(error) : resolve())));
    } catch (error) {
      out.destroy();
      rmSync(partial, { force: true });
      throw error;
    }
    if (hash.digest("base64") !== update.sha512) {
      rmSync(partial, { force: true });
      throw new Error("the downloaded dmg does not match its checksum");
    }
    renameSync(partial, target);
    return target;
  }

  async function check(manual = false) {
    if (busy) return;
    if (file && found) return setState({ status: "downloaded", version: found.version, installMode: "handoff", installNote: PLUS_INSTALL_NOTE });
    busy = true;
    if (manual) setState({ status: "checking" });
    try {
      const picked = pickPlusRelease(await fetchJson(PLUS_RELEASES_API));
      const manifest = picked ? await fetchJson(picked.manifestUrl) : null;
      if (!manifest || compareVersions(manifest.version, currentVersion) <= 0) {
        setState({ status: "idle", ...(manual ? { message: undefined } : {}) });
        return;
      }
      if (!trustedUrl(manifest.url) || typeof manifest.sha512 !== "string" || !/^OpenMausBot-Plus-[\w.-]+-arm64\.dmg$/.test(manifest.dmg ?? "")) {
        throw new Error("the Plus release manifest is malformed");
      }
      found = { ...manifest, notes: picked.release.body ?? "" };
      file = await download(found);
      setState({ status: "downloaded", version: found.version, releaseNotes: found.notes, installMode: "handoff", message: undefined, installNote: PLUS_INSTALL_NOTE });
    } catch (error) {
      logger?.error?.("plus update check failed", error);
      // Background checks fail quietly; a person's own check says why.
      setState(manual ? { status: "error", message: `Plus update failed: ${error?.message ?? error}` } : { status: "idle" });
    } finally {
      busy = false;
    }
  }

  async function install() {
    if (!file || !existsSync(file)) return check(true);
    setState({ status: "installing", installMode: "handoff", message: "Opening the new dmg…" });
    const failure = await openPath(file);
    if (failure) {
      setState({ status: "error", message: `Could not open ${file}: ${failure}` });
      return;
    }
    setState({
      status: "handed-off",
      installMode: "handoff",
      command: undefined,
      message: "Quit OpenMausBot Plus, drag the new app onto Applications, replace, then open it.",
    });
  }

  return { check, install };
}

function sha512File(path) {
  return createHash("sha512").update(readFileSync(path)).digest("base64");
}
