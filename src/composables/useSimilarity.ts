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

export const CLUSTER_THRESHOLD = 0.7;

export interface Cluster {
  centroid: Float32Array;
  memberIds: string[];
  memberVecs: Float32Array[];
}

export function clusterByLeader(
  items: Array<{ id: string; vec: Float32Array }>,
  threshold: number = CLUSTER_THRESHOLD,
): Cluster[] {
  const clusters: Cluster[] = [];
  for (const { id, vec } of items) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < clusters.length; i++) {
      const s = cosine(vec, clusters[i].centroid);
      if (s > bestScore) {
        bestScore = s;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestScore >= threshold) {
      const c = clusters[bestIdx];
      c.memberIds.push(id);
      c.memberVecs.push(vec);
      const next = centroid(c.memberVecs);
      if (next) c.centroid = next;
    } else {
      const init = centroid([vec]);
      if (!init) continue;
      clusters.push({
        centroid: init,
        memberIds: [id],
        memberVecs: [vec],
      });
    }
  }
  return clusters;
}

export function maxSimilarityToClusters(
  vec: Float32Array | null | undefined,
  clusters: Cluster[],
): number {
  if (!vec || clusters.length === 0) return -Infinity;
  let best = -Infinity;
  for (const c of clusters) {
    const s = cosine(vec, c.centroid);
    if (s > best) best = s;
  }
  return best;
}

// Ranking score: max over non-singleton clusters of cosine × log(1 + size).
// Dropping singletons keeps one-off saves from pulling the feed around;
// log-weighting lets a dominant cluster outrank smaller ones without
// silencing them entirely.
export function rankingScoreFromClusters(
  vec: Float32Array | null | undefined,
  clusters: Cluster[],
): number {
  if (!vec) return -Infinity;
  let best = -Infinity;
  for (const c of clusters) {
    const size = c.memberIds.length;
    if (size < 2) continue;
    const score = cosine(vec, c.centroid) * Math.log(1 + size);
    if (score > best) best = score;
  }
  return best;
}

// Ranking strategies
// -------------------
//
// Three ways to turn a user's saved papers into a "recommend" score:
//
//   - "centroid": single average embedding of saved papers. Simple and
//     stable; best when saved papers share a coherent theme.
//   - "bootstrap_centroid": like "centroid", but keeps each saved vec
//     with probability 0.5 (at least one is always kept). Each
//     snapshot produces a slightly different ordering — useful for
//     surfacing variety around the user's core interest.
//   - "clusters": leader-cluster the saved papers and score by
//     `rankingScoreFromClusters` (log-weighted cosine to the best
//     non-singleton cluster). More forgiving of a heterogeneous save
//     list, at the cost of ignoring one-off saves.
//
// `RANKING_STRATEGY` is a code-level toggle; it is not surfaced in the
// UI. Flip it here and rebuild to try another mode.

export type RankingStrategy = "centroid" | "bootstrap_centroid" | "clusters";

export const RANKING_STRATEGY: RankingStrategy = "bootstrap_centroid";

export interface RankingContext {
  /** Score an embedding against the saved signal. Higher = more relevant. */
  score: (vec: Float32Array | null | undefined) => number;
  /** True when there is enough saved signal to produce a meaningful order. */
  active: boolean;
  strategy: RankingStrategy;
  /** One-line human-readable summary for logs. */
  describe: () => string;
}

export function buildRankingContext(
  savedVecs: Array<Float32Array | null | undefined>,
  strategy: RankingStrategy = RANKING_STRATEGY,
): RankingContext {
  const vecs: Float32Array[] = [];
  for (const v of savedVecs) if (v) vecs.push(v);

  if (strategy === "centroid") {
    const c = centroid(vecs);
    const active = c !== null && vecs.length > 0;
    return {
      score: c ? (v) => cosine(c, v) : () => -Infinity,
      active,
      strategy,
      describe: () =>
        active
          ? `[reco:centroid] 1 centroid from ${vecs.length} saved paper${vecs.length === 1 ? "" : "s"}`
          : "[reco:centroid] no saved signal",
    };
  }

  if (strategy === "bootstrap_centroid") {
    let sample = vecs.filter(() => Math.random() < 0.5);
    if (sample.length === 0 && vecs.length > 0) {
      sample = [vecs[Math.floor(Math.random() * vecs.length)]];
    }
    const c = centroid(sample);
    const active = c !== null && vecs.length > 0;
    const kept = sample.length;
    return {
      score: c ? (v) => cosine(c, v) : () => -Infinity,
      active,
      strategy,
      describe: () =>
        active
          ? `[reco:bootstrap_centroid] 1 centroid from ${kept}/${vecs.length} saved (sampled p=0.5)`
          : "[reco:bootstrap_centroid] no saved signal",
    };
  }

  // strategy === "clusters"
  const items = vecs.map((vec, i) => ({ id: String(i), vec }));
  const clusters = clusterByLeader(items);
  const active = clusters.some((c) => c.memberIds.length >= 2);
  return {
    score: (v) => rankingScoreFromClusters(v, clusters),
    active,
    strategy,
    describe: () => {
      const total = clusters.reduce((a, c) => a + c.memberIds.length, 0);
      return `[reco:clusters] ${clusters.length} cluster${clusters.length === 1 ? "" : "s"} from ${total} saved`;
    },
  };
}

/**
 * Gather embedding vectors for the user's saved papers. Returns only
 * non-null vecs, in iteration order of `papers`. Thin helper so the two
 * components that rank against saved signal don't repeat the walk.
 */
export function collectSavedVecs(
  papers: Paper[],
  isSaved: (id: string) => boolean,
  vecFor: (p: Paper) => Float32Array | null,
): Float32Array[] {
  const out: Float32Array[] = [];
  for (const p of papers) {
    if (!isSaved(p.id)) continue;
    const v = vecFor(p);
    if (v) out.push(v);
  }
  return out;
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
