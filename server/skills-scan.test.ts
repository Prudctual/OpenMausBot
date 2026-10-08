import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({ skill: 0, manifest: 0 }));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) => {
      const path = String(args[0]);
      if (path.endsWith(`${join("x", "SKILL.md").slice(1)}`)) reads.skill += 1;
      if (path.endsWith(`${join("x", "skills.json").slice(1)}`)) reads.manifest += 1;
      return actual.readFileSync(...args);
    },
  };
});

import { DATA_DIR } from "./config.ts";
import { listSkills, skillsSystemPrompt } from "./skills.ts";
import { removeTempDir } from "./testing/cleanup.ts";
import { workspaceDir } from "./workspace.ts";

const SKILL = (name: string) => `---\nname: ${name}\ndescription: Reviews ${name}.\n---\n\n# ${name}\n\nDo the thing.\n`;

function install(bot: string, names: string[], disabled: string[] = []) {
  const entries: Record<string, unknown> = {};
  for (const name of names) {
    const content = SKILL(name);
    const directory = join(workspaceDir(bot), "skills", name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "SKILL.md"), content);
    entries[name] = {
      description: `Reviews ${name}.`,
      enabled: !disabled.includes(name),
      source: "legacy:test",
      sha256: createHash("sha256").update(content).digest("hex"),
      importedAt: "2026-01-01T00:00:00.000Z",
      warnings: [],
      skippedFiles: [],
    };
  }
  const stateDir = join(DATA_DIR, "skill-state", bot);
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, "skills.json"), JSON.stringify(entries));
}

describe("skills prompt integrity scan", () => {
  let scratch: string;
  afterEach(async () => {
    if (scratch) await removeTempDir(scratch);
  });

  it("hashes each SKILL.md once per turn and still drops a file that changed", () => {
    scratch = mkdtempSync(join(tmpdir(), "omb-skill-scan-"));
    const bot = "scan-bot";
    install(bot, ["alpha", "bravo", "charlie"], ["charlie"]);
    reads.skill = 0;
    reads.manifest = 0;
    const prompt = skillsSystemPrompt(bot);
    expect(prompt).toContain("- alpha:");
    expect(prompt).toContain("- bravo:");
    expect(prompt).not.toContain("- charlie:");
    expect(reads.skill).toBe(3);
    expect(reads.manifest).toBe(1);

    reads.skill = 0;
    reads.manifest = 0;
    expect(listSkills(bot)).toHaveLength(3);
    expect(reads.skill).toBe(3);
    expect(reads.manifest).toBe(1);

    writeFileSync(join(workspaceDir(bot), "skills", "alpha", "SKILL.md"), `${SKILL("alpha")}\nchanged\n`);
    expect(skillsSystemPrompt(bot)).not.toContain("- alpha:");
    expect(listSkills(bot).find((skill) => skill.name === "alpha")).toMatchObject({ enabled: false });
  });
});
