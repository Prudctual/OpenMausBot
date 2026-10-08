// Drop the Plus marker next to the bundled server so `openmausbot service
// install` from that tree uses a distinct launchd/systemd name. The desktop
// parent also sets OMB_PLUS=1 when it spawns the server.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "dist-server", "plus-build.json");
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, `${JSON.stringify({ plus: true })}\n`);
console.log(`wrote ${dest}`);
