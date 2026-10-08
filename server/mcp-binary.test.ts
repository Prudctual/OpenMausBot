import { describe, expect, it } from "vitest";

import { BINARY_INLINE_MAX_CHARS, binaryReference, takeLargeBinary } from "./mcp-binary.ts";

const pdf = Buffer.from("%PDF-1.4 hello");
/** 25 KiB encodes to more than BINARY_INLINE_MAX_CHARS of base64. 24 KiB lands on the cap and stays inline. */
const big = Buffer.alloc(25 * 1024, 7);

describe("takeLargeBinary", () => {
  it("keeps a payload on the inline cap, a small clip, and an image where they are", () => {
    const exact = Buffer.alloc(24 * 1024, 3);
    expect(exact.toString("base64")).toHaveLength(BINARY_INLINE_MAX_CHARS);
    expect(takeLargeBinary({ type: "audio", mimeType: "audio/wav", data: exact.toString("base64") })).toBeNull();
    expect(takeLargeBinary({ type: "audio", mimeType: "audio/wav", data: Buffer.from("hi").toString("base64") })).toBeNull();
    const image = { type: "image", mimeType: "image/png", data: big.toString("base64") };
    expect(takeLargeBinary(image)).toBeNull();
    expect(takeLargeBinary({
      type: "resource",
      resource: { uri: "mem://shot", mimeType: "image/png", blob: big.toString("base64") },
    })).toBeNull();
    expect(takeLargeBinary({ type: "text", text: "a".repeat(BINARY_INLINE_MAX_CHARS + 10) })).toBeNull();
  });

  it("decodes a large pdf or audio payload and refuses base64 it cannot trust", () => {
    const audio = takeLargeBinary({ type: "audio", mimeType: "Audio/MPEG; codecs=mp3", data: big.toString("base64") });
    expect(audio?.mime).toBe("audio/mpeg");
    expect(audio?.extension).toBe("mp3");
    expect(audio?.bytes.equals(big)).toBe(true);
    expect(takeLargeBinary({
      type: "resource",
      resource: { uri: "mem://doc", mimeType: "application/pdf", blob: "!".repeat(BINARY_INLINE_MAX_CHARS + 8) },
    })).toBeNull();
    const real = takeLargeBinary({
      type: "resource",
      resource: { uri: "mem://doc", mimeType: "application/pdf", blob: Buffer.concat([pdf, big]).toString("base64") },
    });
    expect(real?.extension).toBe("pdf");
    expect(real?.bytes.subarray(0, pdf.length).equals(pdf)).toBe(true);
    expect(binaryReference({ mime: "application/pdf", bytes: 1200, path: "/tmp/doc.pdf" })).toBe(
      'Saved this application/pdf tool result (1,200 bytes) at "/tmp/doc.pdf".',
    );
  });
});
