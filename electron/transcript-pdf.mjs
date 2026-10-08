// Print a transcript to PDF without giving the page a script.
// The renderer supplies the HTML. It is untrusted: JavaScript stays off,
// and a script tag is refused before a window is opened. The hidden window
// uses an in-memory session that can only load its own data or about page.
export const TRANSCRIPT_PDF_MAX_HTML = 5_000_000;

/** In-memory session. A name that starts with persist: would be written to disk. */
export const TRANSCRIPT_PDF_PARTITION = "omb-transcript-pdf";

export const TRANSCRIPT_PDF_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";

/** The document itself. Every other scheme, including file and https, is blocked. */
export function transcriptPdfPageUrl(url) {
  return typeof url === "string" && (url.startsWith("data:") || url.startsWith("about:"));
}

export function transcriptPdfDataUrl(html) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

/** Cancel network requests, refuse navigation and window.open, and force the CSP. */
export function guardTranscriptPdfWindow(win) {
  const contents = win.webContents;
  contents.session.webRequest.onBeforeRequest((details, callback) => {
    callback(transcriptPdfPageUrl(details.url) ? { cancel: false } : { cancel: true });
  });
  contents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [TRANSCRIPT_PDF_CSP],
      },
    });
  });
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  const blockNavigation = (event, url) => {
    if (!transcriptPdfPageUrl(url)) event.preventDefault();
  };
  contents.on("will-navigate", blockNavigation);
  contents.on("will-redirect", blockNavigation);
}

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

export async function renderTranscriptPdf(html, BrowserWindow) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: false,
      partition: TRANSCRIPT_PDF_PARTITION,
    },
  });
  try {
    guardTranscriptPdfWindow(win);
    await win.loadURL(transcriptPdfDataUrl(html));
    return await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
  } finally {
    if (typeof win.isDestroyed !== "function" || !win.isDestroyed()) win.destroy();
  }
}
