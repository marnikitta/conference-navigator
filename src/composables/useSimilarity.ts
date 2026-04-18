import type { Paper } from "@/types";

export function cosine(
  a: Float32Array | null | undefined,
  b: Float32Array | null | undefined,
): number {
  if (!a || !b) return 0;
  let s = 0;
  const n = a.length;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export function centroid(
  vecs: Array<Float32Array | null | undefined>,
): Float32Array | null {
  const first = vecs.find((v): v is Float32Array => !!v);
  if (!first) return null;
  const d = first.length;
  const c = new Float32Array(d);
  for (const v of vecs) {
    if (!v) continue;
    for (let i = 0; i < d; i++) c[i] += v[i];
  }
  let sq = 0;
  for (let i = 0; i < d; i++) sq += c[i] * c[i];
  const n = Math.sqrt(sq) || 1;
  for (let i = 0; i < d; i++) c[i] /= n;
  return c;
}

export function savedCentroid(
  papers: Paper[],
  savedIds: Set<string>,
  vecFor: (p: Paper) => Float32Array | null,
): Float32Array | null {
  const vecs: Float32Array[] = [];
  for (const p of papers) {
    if (!savedIds.has(p.id)) continue;
    const v = vecFor(p);
    if (v) vecs.push(v);
  }
  return centroid(vecs);
}

export interface SimilarHit {
  paper: Paper;
  score: number;
}

export function topKSimilar(
  papers: Paper[],
  seedVec: Float32Array | null,
  vecFor: (p: Paper) => Float32Array | null,
  k: number,
  excludeId?: string,
): SimilarHit[] {
  if (!seedVec) return [];
  const scored: SimilarHit[] = [];
  for (const p of papers) {
    if (p.id === excludeId) continue;
    const v = vecFor(p);
    if (!v) continue;
    scored.push({ paper: p, score: cosine(seedVec, v) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
