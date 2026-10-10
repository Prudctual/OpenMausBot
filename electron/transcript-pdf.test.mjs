import { describe, expect, it, vi } from "vitest";

import {
  TRANSCRIPT_PDF_CSP,
  TRANSCRIPT_PDF_PARTITION,
  renderTranscriptPdf,
  transcriptPdfSaveName,
  writeTranscriptPdf,
} from "./transcript-pdf.mjs";

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
  it("prints in a non-persistent session that blocks the network", async () => {
    const listeners = {};
    let beforeRequest;
    let headersReceived;
    const win = {
      destroyed: false,
      loadURL: vi.fn(async () => {}),
      webContents: {
        session: {
          webRequest: {
            onBeforeRequest: (cb) => { beforeRequest = cb; },
            onHeadersReceived: (cb) => { headersReceived = cb; },
          },
        },
        printToPDF: vi.fn(async () => Buffer.from("%PDF-1.4")),
        setWindowOpenHandler: vi.fn(),
        on: (event, cb) => { listeners[event] = cb; },
      },
      isDestroyed: () => win.destroyed,
      destroy: () => { win.destroyed = true; },
    };
    let options;
    const pdf = await renderTranscriptPdf("<html>notes</html>", class {
      constructor(next) {
        options = next;
        Object.assign(this, win);
      }
    });
    expect(options.show).toBe(false);
    expect(options.webPreferences.javascript).toBe(false);
    expect(options.webPreferences.sandbox).toBe(true);
    expect(options.webPreferences.partition).toBe(TRANSCRIPT_PDF_PARTITION);
    expect(TRANSCRIPT_PDF_PARTITION.startsWith("persist:")).toBe(false);
    expect(win.loadURL).toHaveBeenCalledWith(expect.stringMatching(/^data:text\/html;charset=utf-8,/));
    expect(decodeURIComponent(win.loadURL.mock.calls[0][0].slice("data:text/html;charset=utf-8,".length))).toBe("<html>notes</html>");

    const decision = (url) => new Promise((resolve) => beforeRequest({ url }, resolve));
    expect(await decision("https://evil.example/a")).toEqual({ cancel: true });
    expect(await decision("http://127.0.0.1/")).toEqual({ cancel: true });
    expect(await decision("file:///tmp/transcript.html")).toEqual({ cancel: true });
    expect(await decision("data:text/html,hi")).toEqual({ cancel: false });
    expect(await decision("about:blank")).toEqual({ cancel: false });

    const headers = await new Promise((resolve) => headersReceived({ responseHeaders: { "X-Test": ["1"] } }, resolve));
    expect(headers.responseHeaders["Content-Security-Policy"]).toEqual([TRANSCRIPT_PDF_CSP]);
    expect(headers.responseHeaders["X-Test"]).toEqual(["1"]);
    expect(TRANSCRIPT_PDF_CSP).toBe("default-src 'none'; style-src 'unsafe-inline'; img-src data:");

    expect(win.webContents.setWindowOpenHandler.mock.calls[0][0]({ url: "https://evil.example" })).toEqual({ action: "deny" });
    const navigate = { preventDefault: vi.fn() };
    listeners["will-navigate"](navigate, "https://evil.example/");
    expect(navigate.preventDefault).toHaveBeenCalledOnce();
    const stay = { preventDefault: vi.fn() };
    listeners["will-navigate"](stay, "about:blank");
    expect(stay.preventDefault).not.toHaveBeenCalled();
    const redirect = { preventDefault: vi.fn() };
    listeners["will-redirect"](redirect, "https://evil.example/next");
    expect(redirect.preventDefault).toHaveBeenCalledOnce();

    expect(pdf.toString()).toBe("%PDF-1.4");
    expect(win.destroyed).toBe(true);
  });
});
