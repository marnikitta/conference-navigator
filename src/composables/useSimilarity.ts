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

// Ranking score: log-sum-exp with temperature τ over non-singleton
// clusters of cosine × log(1 + size). Singletons are dropped so one-off
// saves don't pull the feed. τ→0 recovers hard max-over-clusters (blocky
// bands); larger τ softens the assignment so papers near multiple
// clusters get credit from each, and the between-cluster boundary
// becomes a gradient instead of a cliff.
export function rankingScoreFromClusters(
  vec: Float32Array | null | undefined,
  clusters: Cluster[],
  temperature: number = RANKING_TEMPERATURE,
): number {
  if (!vec) return -Infinity;
  const xs: number[] = [];
  for (const c of clusters) {
    const size = c.memberIds.length;
    if (size < 2) continue;
    xs.push(cosine(vec, c.centroid) * Math.log(1 + size));
  }
  if (xs.length === 0) return -Infinity;
  if (xs.length === 1) return xs[0];
  let max = -Infinity;
  for (const x of xs) if (x > max) max = x;
  let sum = 0;
  for (const x of xs) sum += Math.exp((x - max) / temperature);
  return max + temperature * Math.log(sum);
}

// Ranking strategies
// -------------------
//
// Three ways to turn a user's saved papers into a "recommend" feed:
//
//   - "centroid": single average embedding. Simple and stable; used by
//     FilterDrawer to order the cluster filter chips.
//   - "clusters": leader-cluster the saves, score via LSE over
//     log-size-weighted cosine to each cluster centroid. Used by the
//     offline harness as a baseline to measure the opinionated mix
//     against. Not selected by the app at runtime.
//   - "opinionated" (default): cluster-LSE relevance + rating-quality
//     prior + MMR diversification + session-stable jitter. Favors
//     high-rated papers and interleaves clusters so near-duplicates
//     don't stack. See the OPINIONATED_* knobs above.
//
// `RANKING_STRATEGY` is a code-level toggle; it is not surfaced in the
// UI. Flip it here and rebuild to try another mode.

export type RankingStrategy = "centroid" | "clusters" | "opinionated";

export const RANKING_STRATEGY: RankingStrategy = "opinionated";

// Softness of the per-paper cluster blend for the "clusters" strategy.
// 0 → hard max (blocky bands); larger → smoother mixing across clusters.
// The opinionated strategy uses its own internal τ; this is for the
// standalone "clusters" mode.
export const RANKING_TEMPERATURE = 0.3;

// --- opinionated strategy knobs -------------------------------------
// These are deliberately frozen, not exposed in UI. Changing them is a
// code change with clear intent.

// Quality prior shape: rating 5 → 0, rating 7 → 1, clipped. Papers with
// no rating (Journal Track etc.) get a mild 0.3 — present but discounted.
// Smooth, saturating: a 9.0 rating isn't worth much more than a 7.0 in
// this model, which matches how ICLR review scores actually behave.
export function qualityPrior(rating: number | null): number {
  if (rating == null) return 0.3;
  return Math.max(0, Math.min(1, (rating - 5) / 2));
}

// How hard the rating signal tilts the ordering. 0.8 means a top-rated
// paper gets a log-point boost on top of cluster relevance, roughly
// equivalent to belonging to a 2× larger saved cluster. Big enough to
// reliably surface quality; not so big that off-topic 8.0s swamp
// on-topic 6.5s.
// Tune: 0.0–2.0. Presets: 0.3 topic-first (ratings barely nudge),
// 0.8 balanced (current), 1.5 quality-first (ratings dominate ties).
const OPINIONATED_RATING_WEIGHT = 0.5;

// MMR diversification. λ closer to 1 → relevance-dominant (blocky);
// closer to 0 → diversity-dominant (random-feeling). 0.75 is the
// sweet spot for "same interest, but don't stack 10 near-duplicates".
// Tune: 0.50–0.95. Presets: 0.60 exploratory (broad mix),
// 0.75 balanced (current), 0.90 focused (allows small duplicate stacks).
const OPINIONATED_LAMBDA = 0.80;

// Pool size for MMR. Only the top N by relevance are reordered; the
// rest fall through unchanged. MMR is O(pick·pool·dim) — increasing
// these costs quickly. 250/120 covers a typical first page with
// comfortable headroom without burning a second of main-thread time.
// Tune: 100–500. Presets: 150 snappy (shallower diversity reach),
// 250 balanced (current), 400 thorough (pulls from deeper tail, slower).
const OPINIONATED_POOL = 250;

// How many items to pick via MMR. Beyond this, the relevance-sorted
// tail is returned as-is.
// Tune: 50–200. Presets: 60 short curated feed, 120 balanced (current),
// 200 long feed (MMR governs more of the list). Keep ≤ POOL.
const OPINIONATED_PICK = 120;

// Cluster-LSE temperature used inside the opinionated mix. Kept low so
// the cluster score preserves a meaningful relevance signal — MMR does
// the diversification, not τ.
// Tune: 0.1–1.0. Presets: 0.15 sharp (hard max, blocky bands),
// 0.3 balanced (current), 0.6 smooth (credits papers near multiple
// clusters — softer boundaries, weaker dominant-cluster signal).
const OPINIONATED_TAU = 0.3;

// Jitter applied to the relevance score so repeat visits don't show the
// identical feed. Noise is ε·(uniform − 0.5), so the shift per paper is
// in [−ε/2, +ε/2]. With the opinionated score range ≈ 0.9, ε=0.10 is
// about 6% of the span — enough to swap near-equal neighbours without
// moving top picks noticeably. Stable across filter/query changes
// within the same page session (see VEC_NOISE below).
// Tune: 0.0–0.3. Presets: 0.00 deterministic (no shuffle across
// reloads), 0.10 subtle (current), 0.20 chatty (top picks can swap).
const OPINIONATED_NOISE = 0.1;

// Per-vec noise cache, module-scoped and keyed by Float32Array
// identity. `papersStore.vecFor(p)` returns the same object for a given
// paper for the life of the page, so each paper keeps one noise value
// across filter tweaks, query edits, and re-snapshots. A full page
// reload starts a fresh cache (new embeddings Map → new Float32Array
// instances), which is exactly when the user expects a different feed.
const VEC_NOISE = new WeakMap<Float32Array, number>();
function noiseForVec(vec: Float32Array): number {
  let n = VEC_NOISE.get(vec);
  if (n === undefined) {
    n = Math.random() - 0.5;
    VEC_NOISE.set(vec, n);
  }
  return n;
}

export interface RankingContext {
  /** Score an embedding against the saved signal. Higher = more relevant. */
  score: (vec: Float32Array | null | undefined) => number;
  /** True when there is enough saved signal to produce a meaningful order. */
  active: boolean;
  strategy: RankingStrategy;
  /** One-line human-readable summary for logs. */
  describe: () => string;
  /** Log per-ranking-pass diagnostics given the top-K papers. */
  diagnose?: (
    topItems: Array<{
      vec: Float32Array | null | undefined;
      rating: number | null;
    }>,
  ) => void;
  /**
   * Feed-level reranker. Strategies that need more than a per-item
   * score (e.g. MMR, which depends on already-picked items) implement
   * this. Returns the full candidate list in final order. When absent,
   * the caller should fall back to sorting by `score`.
   */
  rerank?: <T>(
    candidates: T[],
    vecOf: (c: T) => Float32Array | null | undefined,
    ratingOf: (c: T) => number | null,
  ) => T[];
}

/**
 * MMR (Maximal Marginal Relevance) post-rank. Iteratively picks the
 * candidate that maximizes `λ·rel − (1−λ)·max(cos to already-picked)`.
 * Only the top `poolSize` by relevance enter the pool; beyond that,
 * candidates fall through in relevance order (cost control).
 */
export function mmrRerank<T>(
  candidates: T[],
  vecOf: (c: T) => Float32Array | null | undefined,
  relOf: (c: T) => number,
  opts: { k: number; poolSize: number; lambda: number },
): T[] {
  const withVec: Array<{ item: T; vec: Float32Array; rel: number }> = [];
  const vecless: T[] = [];
  for (const c of candidates) {
    const v = vecOf(c);
    if (v) withVec.push({ item: c, vec: v, rel: relOf(c) });
    else vecless.push(c);
  }
  withVec.sort((a, b) => b.rel - a.rel);
  const pool = withVec.slice(0, Math.min(opts.poolSize, withVec.length));
  const afterPool = withVec.slice(opts.poolSize);
  const picked: typeof pool = [];
  while (picked.length < opts.k && pool.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      let maxSim = 0;
      for (const s of picked) {
        const sim = cosine(c.vec, s.vec);
        if (sim > maxSim) maxSim = sim;
      }
      const score = opts.lambda * c.rel - (1 - opts.lambda) * maxSim;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    picked.push(pool[bestIdx]);
    pool.splice(bestIdx, 1);
  }
  return [
    ...picked.map((x) => x.item),
    ...pool.map((x) => x.item),
    ...afterPool.map((x) => x.item),
    ...vecless,
  ];
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

  const items = vecs.map((vec, i) => ({ id: String(i), vec }));
  const clusters = clusterByLeader(items);
  const nonSingletons = clusters.filter((c) => c.memberIds.length >= 2);

  if (strategy === "clusters") {
    const active = nonSingletons.length > 0;
    const tau = RANKING_TEMPERATURE;
    return {
      score: (v) => rankingScoreFromClusters(v, clusters, tau),
      active,
      strategy,
      describe: () => {
        const sizes = clusters
          .map((c) => c.memberIds.length)
          .sort((a, b) => b - a);
        const total = sizes.reduce((a, b) => a + b, 0);
        return `[reco:clusters] τ=${tau.toFixed(2)}, ${clusters.length} cluster${clusters.length === 1 ? "" : "s"} (sizes ${sizes.join(",")}) from ${total} saved`;
      },
      diagnose: (topItems) => {
        if (nonSingletons.length === 0) return;
        const counts = new Array(nonSingletons.length).fill(0);
        let entropySum = 0;
        let scoreMin = Infinity;
        let scoreMax = -Infinity;
        let total = 0;
        for (const item of topItems) {
          const v = item.vec;
          if (!v) continue;
          const xs: number[] = [];
          for (const c of nonSingletons) {
            xs.push(cosine(v, c.centroid) * Math.log(1 + c.memberIds.length));
          }
          let mx = -Infinity;
          for (const x of xs) if (x > mx) mx = x;
          const exps: number[] = [];
          let denom = 0;
          for (const x of xs) {
            const e = Math.exp((x - mx) / tau);
            exps.push(e);
            denom += e;
          }
          let domIdx = 0;
          let domW = -Infinity;
          let H = 0;
          for (let i = 0; i < exps.length; i++) {
            const w = exps[i] / denom;
            if (w > domW) {
              domW = w;
              domIdx = i;
            }
            if (w > 1e-12) H -= w * Math.log(w);
          }
          counts[domIdx]++;
          entropySum += H;
          const score = mx + tau * Math.log(denom);
          if (score < scoreMin) scoreMin = score;
          if (score > scoreMax) scoreMax = score;
          total++;
        }
        if (total === 0) return;
        const maxH = Math.log(nonSingletons.length);
        const avgH = entropySum / total;
        const pct = maxH > 0 ? (avgH / maxH) * 100 : 0;
        const breakdown = counts
          .map(
            (n, i) => `c${i}(size=${nonSingletons[i].memberIds.length}):${n}`,
          )
          .join(" ");
        console.log(`[reco:clusters] top ${total} dominance — ${breakdown}`);
        console.log(
          `[reco:clusters] top ${total} softmax entropy avg=${avgH.toFixed(3)} / max=${maxH.toFixed(3)} (${pct.toFixed(0)}% smooth)`,
        );
        console.log(
          `[reco:clusters] top ${total} score range ${scoreMin.toFixed(3)} → ${scoreMax.toFixed(3)}`,
        );
      },
    };
  }

  // strategy === "opinionated"
  // Cluster-LSE relevance + rating-quality prior, then MMR diversify.
  const tau = OPINIONATED_TAU;
  const gamma = OPINIONATED_RATING_WEIGHT;
  const lambda = OPINIONATED_LAMBDA;
  const poolSize = OPINIONATED_POOL;
  const pickK = OPINIONATED_PICK;
  const active = nonSingletons.length > 0 || vecs.length > 0;
  const relOfVec = (v: Float32Array) => {
    if (nonSingletons.length > 0) {
      return rankingScoreFromClusters(v, clusters, tau);
    }
    // Single-cluster fallback: just cosine to the only centroid.
    const only = clusters[0];
    return only ? cosine(v, only.centroid) : 0;
  };
  return {
    score: (v) => (v ? relOfVec(v) : -Infinity),
    active,
    strategy,
    describe: () => {
      const sizes = clusters
        .map((c) => c.memberIds.length)
        .sort((a, b) => b - a);
      const total = sizes.reduce((a, b) => a + b, 0);
      return `[reco:opinionated] τ=${tau}, γ=${gamma}, λ=${lambda}, ε=${OPINIONATED_NOISE}, pool=${poolSize}/pick=${pickK}; ${clusters.length} cluster${clusters.length === 1 ? "" : "s"} (sizes ${sizes.join(",")}) from ${total} saved`;
    },
    rerank: (candidates, vecOf, ratingOf) =>
      mmrRerank(
        candidates,
        vecOf,
        (c) => {
          const v = vecOf(c);
          if (!v) return -Infinity;
          return (
            relOfVec(v) +
            gamma * qualityPrior(ratingOf(c)) +
            OPINIONATED_NOISE * noiseForVec(v)
          );
        },
        { k: pickK, poolSize, lambda },
      ),
    diagnose: (topItems) => {
      let total = 0;
      let ratedCount = 0;
      let ratingSum = 0;
      let cohSum = 0;
      const c0 = clusters[0]?.centroid;
      const dom: Record<number, number> = {};
      for (const item of topItems) {
        const v = item.vec;
        if (!v) continue;
        total++;
        if (item.rating != null) {
          ratedCount++;
          ratingSum += item.rating;
        }
        if (c0) cohSum += cosine(v, c0);
        if (nonSingletons.length > 0) {
          let bestIdx = 0;
          let bestX = -Infinity;
          for (let i = 0; i < nonSingletons.length; i++) {
            const x =
              cosine(v, nonSingletons[i].centroid) *
              Math.log(1 + nonSingletons[i].memberIds.length);
            if (x > bestX) {
              bestX = x;
              bestIdx = i;
            }
          }
          dom[bestIdx] = (dom[bestIdx] || 0) + 1;
        }
      }
      if (total === 0) return;
      const breakdown = nonSingletons
        .map((c, i) => `c${i}(size=${c.memberIds.length}):${dom[i] || 0}`)
        .join(" ");
      console.log(
        `[reco:opinionated] top ${total} dominant cluster — ${breakdown}`,
      );
      if (ratedCount > 0) {
        console.log(
          `[reco:opinionated] top ${total} mean★=${(ratingSum / ratedCount).toFixed(2)} (${ratedCount} rated)`,
        );
      }
      if (c0) {
        console.log(
          `[reco:opinionated] top ${total} mean cos-to-main-centroid=${(cohSum / total).toFixed(3)}`,
        );
      }
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
