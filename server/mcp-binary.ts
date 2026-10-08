// Large non-image binaries in an MCP tool result. Images stay in the
// result (the drivers already lift those out as pictures). A PDF, a clip
// of audio, or any other big blob is written beside the other oversized
// tool results and the model gets one short line naming the file.

/** Base64 characters that may stay inline. Past this, the bytes go to a file. */
export const BINARY_INLINE_MAX_CHARS = 32_768;

export interface LargeBinary {
  bytes: Buffer;
  mime: string;
  extension: string;
}

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "application/zip": "zip",
  "application/octet-stream": "bin",
};

function extensionFor(mime: string): string {
  const known = EXTENSIONS[mime];
  if (known) return known;
  const subtype = mime.split("/")[1]?.split("+")[0] ?? "";
  const clean = subtype.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  return clean || "bin";
}

/** MIME type without parameters, so `audio/mpeg; codecs=mp3` still maps to mp3. */
function mimeOf(value: unknown): string {
  const raw = typeof value === "string" && value.trim() ? value.toLowerCase() : "application/octet-stream";
  return raw.split(";")[0]?.trim() || "application/octet-stream";
}

function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}

function decodeBase64(data: string): Buffer | null {
  const compact = data.replace(/\s/g, "");
  if (compact.length === 0 || compact.length % 4 === 1) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return null;
  const bytes = Buffer.from(compact, "base64");
  const round = bytes.toString("base64").replace(/=+$/, "");
  return round === compact.replace(/=+$/, "") ? bytes : null;
}

function payload(block: unknown): { data: string; mime: string } | null {
  if (!block || typeof block !== "object") return null;
  const record = block as { type?: unknown; data?: unknown; mimeType?: unknown; resource?: unknown };
  if (record.type === "audio" && typeof record.data === "string") {
    const mime = mimeOf(record.mimeType);
    return isImage(mime) ? null : { data: record.data, mime };
  }
  if (record.type === "resource" && record.resource && typeof record.resource === "object") {
    const resource = record.resource as { blob?: unknown; mimeType?: unknown };
    if (typeof resource.blob !== "string") return null;
    const mime = mimeOf(resource.mimeType);
    return isImage(mime) ? null : { data: resource.blob, mime };
  }
  return null;
}

/** A content block that should leave the model context, or null when it
 * should stay: an image, a small payload, text, or base64 this cannot trust. */
export function takeLargeBinary(block: unknown, limit = BINARY_INLINE_MAX_CHARS): LargeBinary | null {
  const found = payload(block);
  if (!found || found.data.replace(/\s/g, "").length <= limit) return null;
  const bytes = decodeBase64(found.data);
  if (!bytes) return null;
  return { bytes, mime: found.mime, extension: extensionFor(found.mime) };
}

/** The one line that replaces the block. The path is the whole point: a
 * binary has no useful prefix to keep inline. */
export function binaryReference(input: { mime: string; bytes: number; path: string }): string {
  return `Saved this ${input.mime} tool result (${input.bytes.toLocaleString("en-US")} bytes) at ${JSON.stringify(input.path)}.`;
}
