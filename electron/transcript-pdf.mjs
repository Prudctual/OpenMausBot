// Print a transcript to PDF without giving the page a script.
// The renderer supplies the HTML. It is untrusted: JavaScript stays off,
// and a script tag is refused before a window is opened.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const TRANSCRIPT_PDF_MAX_HTML = 5_000_000;

export function transcriptPdfSaveName(filename) {
  const cleaned = String(filename ?? "").replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim().replace(/^\.+/, "").slice(0, 180);
  const stem = cleaned.toLowerCase().endsWith(".pdf") ? cleaned.slice(0, -4).trim() : cleaned;
  return `${stem || "conversation-transcript"}.pdf`;
}

export async function writeTranscriptPdf({ html, filename, choosePath, printHtml, writeFile }) {
  if (typeof html !== "string" || !html.trim()) throw new Error("nothing to export");
  if (html.length > TRANSCRIPT_PDF_MAX_HTML) throw new Error("transcript is too large to export as pdf");
  if (/<script[\s>]/i.test(html)) throw new Error("transcript html was refused");
  const filePath = await choosePath(transcriptPdfSaveName(filename));
  if (!filePath) return null;
  const pdf = await printHtml(html);
  await writeFile(filePath, pdf);
  return filePath;
}

export async function renderTranscriptPdf(html, BrowserWindow, io = { mkdtempSync, writeFileSync, rmSync }) {
  const dir = io.mkdtempSync(join(tmpdir(), "omb-transcript-"));
  const file = join(dir, "transcript.html");
  try {
    io.writeFileSync(file, html, { encoding: "utf8", mode: 0o600 });
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        javascript: false,
      },
    });
    try {
      await win.loadFile(file);
      return await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
    } finally {
      if (typeof win.isDestroyed !== "function" || !win.isDestroyed()) win.destroy();
    }
  } finally {
    io.rmSync(dir, { recursive: true, force: true });
  }
}
