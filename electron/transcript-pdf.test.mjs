import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { renderTranscriptPdf, transcriptPdfSaveName, writeTranscriptPdf } from "./transcript-pdf.mjs";

describe("writeTranscriptPdf", () => {
  it("asks for a pdf path, prints, and writes the bytes", async () => {
    const writeFile = vi.fn();
    const printHtml = vi.fn(async () => Buffer.from("%PDF"));
    const saved = await writeTranscriptPdf({
      html: "<html><body>hello</body></html>",
      filename: "../Coder transcript.md",
      choosePath: async (name) => `/tmp/${name}`,
      printHtml,
      writeFile,
    });
    expect(transcriptPdfSaveName("../Coder transcript.md")).toBe("Coder transcript.md.pdf");
    expect(saved).toBe("/tmp/Coder transcript.md.pdf");
    expect(printHtml).toHaveBeenCalledWith("<html><body>hello</body></html>");
    expect(writeFile).toHaveBeenCalledWith("/tmp/Coder transcript.md.pdf", Buffer.from("%PDF"));
  });

  it("returns null when the save dialog is cancelled and refuses a script", async () => {
    const printHtml = vi.fn();
    expect(await writeTranscriptPdf({
      html: "<html></html>",
      filename: "a.pdf",
      choosePath: async () => null,
      printHtml,
      writeFile: vi.fn(),
    })).toBeNull();
    expect(printHtml).not.toHaveBeenCalled();
    await expect(writeTranscriptPdf({
      html: "<html><script>alert(1)</script></html>",
      filename: "a.pdf",
      choosePath: async () => "/tmp/a.pdf",
      printHtml,
      writeFile: vi.fn(),
    })).rejects.toThrow(/refused/);
  });
});

describe("renderTranscriptPdf", () => {
  it("prints with javascript off and removes the temporary file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "omb-pdf-test-"));
    let loaded = "";
    const win = {
      destroyed: false,
      webContents: { printToPDF: vi.fn(async () => Buffer.from("%PDF-1.4")) },
      loadFile: vi.fn(async (file) => { loaded = readFileSync(file, "utf8"); }),
      isDestroyed: () => win.destroyed,
      destroy: () => { win.destroyed = true; },
    };
    const pdf = await renderTranscriptPdf("<html>notes</html>", class {
      constructor(options) {
        expect(options.show).toBe(false);
        expect(options.webPreferences.javascript).toBe(false);
        expect(options.webPreferences.sandbox).toBe(true);
        Object.assign(this, win);
      }
    }, {
      mkdtempSync: () => dir,
      writeFileSync,
      rmSync,
    });
    expect(pdf.toString()).toBe("%PDF-1.4");
    expect(loaded).toBe("<html>notes</html>");
    expect(win.destroyed).toBe(true);
    expect(() => readFileSync(join(dir, "transcript.html"))).toThrow();
  });
});
