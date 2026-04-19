import { describe, it, expect } from "vitest";
import { encodeIds, decodeIds } from "./idCodec";

function roundTrip(ids: string[]): string[] {
  return decodeIds(encodeIds(ids));
}

function sortedNumeric(ids: string[]): string[] {
  return [...ids].sort((a, b) => Number(a) - Number(b));
}

describe("encodeIds / decodeIds", () => {
  it("returns empty string for empty input", () => {
    expect(encodeIds([])).toBe("");
  });

  it("returns empty array for empty input", () => {
    expect(decodeIds("")).toEqual([]);
    expect(decodeIds("   ")).toEqual([]);
  });

  it("round-trips a single ID", () => {
    expect(roundTrip(["42"])).toEqual(["42"]);
  });

  it("round-trips 0 correctly (first-delta edge case)", () => {
    expect(roundTrip(["0"])).toEqual(["0"]);
    expect(roundTrip(["0", "1", "2"])).toEqual(["0", "1", "2"]);
  });

  it("round-trips a small sorted list", () => {
    const ids = ["1", "7", "42", "100", "1024"];
    expect(roundTrip(ids)).toEqual(ids);
  });

  it("sorts numeric IDs on encode (delta encoding requires order)", () => {
    const ids = ["100", "1", "42", "7"];
    expect(roundTrip(ids)).toEqual(sortedNumeric(ids));
  });

  it("dedupes on encode", () => {
    const ids = ["7", "7", "7", "42", "42"];
    expect(roundTrip(ids)).toEqual(["7", "42"]);
  });

  it("handles large IDs requiring multi-byte varints", () => {
    // 128 is the first value that needs a 2-byte varint; 16384 needs 3.
    const ids = ["0", "127", "128", "16383", "16384", "1000000"];
    expect(roundTrip(ids)).toEqual(ids);
  });

  it("stays URL-safe (base64url alphabet only)", () => {
    const ids = Array.from({ length: 300 }, (_, i) => String(i * 37 + 1));
    const encoded = encodeIds(ids);
    expect(encoded).toMatch(/^[A-Za-z0-9_\-]+$/);
  });

  it("produces a compact encoding (~2 bytes per ID for dense spreads)", () => {
    // 300 IDs in [1..~11000] → should fit in ~700 base64url chars.
    const ids = Array.from({ length: 300 }, (_, i) => String(i * 37 + 1));
    const encoded = encodeIds(ids);
    expect(encoded.length).toBeLessThan(700);
  });

  it("round-trips a realistic saved list", () => {
    const ids = [
      "3",
      "17",
      "42",
      "189",
      "256",
      "999",
      "1024",
      "4096",
      "8192",
      "12345",
    ];
    expect(roundTrip(ids)).toEqual(ids);
  });

  it("falls back to CSV when any ID is non-numeric", () => {
    const ids = ["paperA", "paperB", "paperC"];
    const encoded = encodeIds(ids);
    expect(encoded).toBe("paperA,paperB,paperC");
    expect(decodeIds(encoded)).toEqual(ids);
  });

  it("CSV fallback preserves insertion order (not sorted)", () => {
    const ids = ["zeta", "alpha", "mu"];
    expect(roundTrip(ids)).toEqual(["zeta", "alpha", "mu"]);
  });

  it("CSV fallback cannot round-trip IDs containing separator chars", () => {
    // Documented limitation: both the encoder's CSV join and the decoder's
    // tokenizer use [^A-Za-z0-9]+ as the separator. IDs containing "-",
    // "_", ".", etc. survive encoding (they get joined with commas) but
    // the tokenizer splits them apart on decode. If the pipeline ever
    // emits non-numeric IDs, they must be alphanumeric only.
    expect(roundTrip(["paper-a"])).toEqual(["paper", "a"]);
  });

  it("decodes a plain comma-separated list", () => {
    expect(decodeIds("1,2,3")).toEqual(["1", "2", "3"]);
  });

  it("decodes whitespace/newline-separated input", () => {
    expect(decodeIds("1 2\n3\t4, 5")).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("ignores empty tokens and punctuation in CSV fallback", () => {
    expect(decodeIds("1,,2,  ,3")).toEqual(["1", "2", "3"]);
  });

  it("rejects negative IDs (falls back to CSV)", () => {
    // isNonNegInt gates the varint path; "-1" slips to CSV.
    const encoded = encodeIds(["-1", "2"]);
    expect(encoded).toBe("-1,2");
  });

  it("rejects non-integer numeric strings (falls back to CSV)", () => {
    const encoded = encodeIds(["1.5", "2"]);
    expect(encoded).toBe("1.5,2");
  });

  it("handles values up to the 49-bit varint ceiling", () => {
    // Decoder caps at shift > 49 to stay inside Number.MAX_SAFE_INTEGER
    // with room for the running delta sum. A value that fits in 49 bits
    // must round-trip; larger inputs aren't a supported use case (paper
    // IDs today are small integers).
    const near49 = String(2 ** 49 - 1);
    expect(roundTrip([near49])).toEqual([near49]);
  });

  it("is stable across encode/decode repetitions", () => {
    const ids = ["5", "10", "15", "20"];
    const once = encodeIds(ids);
    const twice = encodeIds(decodeIds(once));
    expect(twice).toBe(once);
  });

  it("preserves order of a dense consecutive range", () => {
    const ids = Array.from({ length: 50 }, (_, i) => String(i));
    expect(roundTrip(ids)).toEqual(ids);
  });

  it("handles sparse IDs with large gaps", () => {
    const ids = ["1", "1000000", "2000000"];
    expect(roundTrip(ids)).toEqual(ids);
  });

  it("decodes truncated/garbage base64url gracefully (returns [] or CSV)", () => {
    // Single char "A" decodes to a single 0-byte → one ID "0". That's
    // technically valid varint, so expect either [] or a numeric list —
    // just ensure it doesn't throw.
    expect(() => decodeIds("A")).not.toThrow();
    expect(() => decodeIds("!!!invalid!!!")).not.toThrow();
  });
});
