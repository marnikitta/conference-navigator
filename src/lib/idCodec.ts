// Dense URL codec for saved paper IDs.
//
// Happy path (all IDs are non-negative integers, as they are today in
// rated-papers.json): dedupe → sort → delta-encode → LEB128 varints →
// base64url. ~2 bytes per ID for a typical spread → ~700 URL chars for
// 300 papers. Falls back to a plain comma-separated list if any ID is
// non-numeric, so the scheme stays robust if the pipeline ever emits
// mixed IDs.

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function isNonNegInt(s: string): boolean {
  if (!/^\d+$/.test(s)) return false;
  const n = Number(s);
  return Number.isSafeInteger(n) && n >= 0;
}

function parseCsv(text: string): string[] {
  return text
    .split(/[^A-Za-z0-9]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function encodeIds(ids: string[]): string {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return "";
  if (!unique.every(isNonNegInt)) return unique.join(",");

  const nums = unique.map(Number).sort((a, b) => a - b);
  const bytes: number[] = [];
  let prev = 0;
  for (const n of nums) {
    let delta = n - prev;
    prev = n;
    while (delta >= 0x80) {
      bytes.push((delta % 128) | 0x80);
      delta = Math.floor(delta / 128);
    }
    bytes.push(delta);
  }
  return bytesToBase64Url(new Uint8Array(bytes));
}

export function decodeIds(param: string): string[] {
  const trimmed = param.trim();
  if (!trimmed) return [];

  // Try base64url varint first. If the param happens to be CSV-looking
  // (contains a comma or any char outside the base64url alphabet), skip
  // straight to the CSV fallback.
  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    try {
      const bytes = base64UrlToBytes(trimmed);
      const out: string[] = [];
      let prev = 0;
      let i = 0;
      while (i < bytes.length) {
        let delta = 0;
        let shift = 0;
        let b: number;
        do {
          if (i >= bytes.length) throw new Error("truncated varint");
          b = bytes[i++];
          delta += (b & 0x7f) * Math.pow(2, shift);
          shift += 7;
          if (shift > 49) throw new Error("varint too long");
        } while (b & 0x80);
        prev += delta;
        out.push(String(prev));
      }
      if (out.length > 0) return out;
    } catch {
      // fall through
    }
  }

  return parseCsv(trimmed);
}
