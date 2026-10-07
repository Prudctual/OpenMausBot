// The harness writes one daily-log line after the turn diff. That line is
// the harness's own note, not an edit made outside the app. Several turns
// against the fixture and the fake engine must leave no person/disk rows.
import { expect, it } from "vitest";
import { launchVerificationServer, runControlOmb } from "../scripts/control-omb.ts";
import type { WireBot } from "../shared/wire.ts";

const TURNS = 4;

function localDay(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

it("does not journal harness daily-log lines as changes made outside the app", async () => {
  const fixture = await launchVerificationServer();
  const control = (...args: string[]) => runControlOmb([...args, "--url", fixture.info.url]);
  const api = async <T = unknown>(path: string, method = "GET", body?: unknown, status = 200): Promise<T> => {
    const response = await fetch(fixture.info.url + path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    expect(response.status, `${method} ${path}`).toBe(status);
    return response.json() as Promise<T>;
  };
  try {
    const { bot } = await api<{ bot: WireBot }>("/api/bots", "POST", { name: "Journal" }, 201);
    await api(`/api/bots/${bot.id}`, "PATCH", { memoryUpkeep: false });
    for (let turn = 1; turn <= TURNS; turn += 1) {
      await control("send", "--bot", bot.id, "--text", `Turn ${turn}: note the invoices.`);
      expect(await control("wait", "--bot", bot.id, "--timeout", "30")).toMatchObject({ status: "settled" });
    }
    const log = await api<{ text: string }>(`/api/bots/${bot.id}/memory/file?path=${encodeURIComponent(`memory/log/${localDay()}.md`)}`);
    expect(log.text.trim().split("\n").filter((line) => /^- \d{2}:\d{2} /.test(line))).toHaveLength(TURNS);
    const journal = await api<{ entries: Array<{ actor: string; via: string; path: string }> }>(`/api/bots/${bot.id}/memory/journal?limit=200`);
    const outside = journal.entries.filter((row) => row.actor === "person" && row.via === "disk");
    expect(outside).toEqual([]);
  } finally {
    await fixture.close();
  }
}, 120_000);
