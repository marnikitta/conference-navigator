// Offline harness to compare ranking strategies against real data.
// Gated behind RECO_DEBUG=1 so normal test runs skip it. Invoke with:
//
//   RECO_DEBUG=1 npx vitest run src/composables/reco.debug.test.ts
//
// Hard-codes a sample saved-ID set (40 papers with one dominant interest +
// several smaller ones) so output is reproducible across iterations.

import { describe, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  centroid,
  clusterByLeader,
  cosine,
  mmrRerank as mmrRerankGeneric,
  qualityPrior,
  rankingScoreFromClusters,
  type Cluster,
} from "./useSimilarity";

const SAVED_IDS = [
  "10006476",
  "10007498",
  "10007905",
  "10008063",
  "10008071",
  "10008719",
  "10008992",
  "10009205",
  "10009680",
  "10009969",
  "10010012",
  "10010079",
  "10010162",
  "10010506",
  "10010891",
  "10011453",
  "10011454",
  "10011715",
  "10011716",
  "10010662",
  "10010931",
  "10007497",
  "10009900",
  "10009005",
  "10008736",
  "10009494",
  "10009493",
  "10009971",
  "10009972",
  "10009147",
  "10009146",
  "10006985",
  "10006532",
  "10006531",
  "10007023",
  "10007174",
  "10007531",
  "10009073",
  "10009933",
  "10010092",
];

interface Candidate {
  id: string;
  title: string;
  rating: number | null;
  topic: string | null;
  vec: Float32Array;
}

function loadCorpus(): { all: Candidate[]; byId: Map<string, Candidate> } {
  const root = process.cwd();
  const rawPapers = JSON.parse(
    fs.readFileSync(path.join(root, "public/data/papers.json"), "utf8"),
  ) as Array<{
    id: string;
    title: string;
    openreview?: { ratings?: number[] } | null;
    metadata?: { topic?: string | null };
  }>;
  const rawEmb = JSON.parse(
    fs.readFileSync(path.join(root, "public/data/embeddings.json"), "utf8"),
  ) as Record<string, number[]>;

  const embs = new Map<string, Float32Array>();
  for (const id in rawEmb) {
    const arr = rawEmb[id];
    if (!arr?.length) continue;
    const v = new Float32Array(arr);
    let sq = 0;
    for (let i = 0; i < v.length; i++) sq += v[i] * v[i];
    const n = Math.sqrt(sq) || 1;
    for (let i = 0; i < v.length; i++) v[i] /= n;
    embs.set(id, v);
  }

  const all: Candidate[] = [];
  for (const raw of rawPapers) {
    const v = embs.get(raw.id);
    if (!v) continue;
    const ratings = raw.openreview?.ratings ?? [];
    const rating = ratings.length
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length
      : null;
    all.push({
      id: raw.id,
      title: raw.title,
      rating,
      topic: raw.metadata?.topic ?? null,
      vec: v,
    });
  }
  return { all, byId: new Map(all.map((p) => [p.id, p])) };
}

// lseNoSize is a harness-only variant that drops the `log(1+size)`
// weighting. Used to show why size weighting matters (without it,
// singleton-dominated clusters can hijack the feed).
function lseNoSize(
  vec: Float32Array,
  clusters: Cluster[],
  tau: number,
): number {
  const xs: number[] = [];
  for (const c of clusters) {
    if (c.memberIds.length < 2) continue;
    xs.push(cosine(vec, c.centroid));
  }
  if (xs.length === 0) return -Infinity;
  if (xs.length === 1) return xs[0];
  let mx = -Infinity;
  for (const x of xs) if (x > mx) mx = x;
  let sum = 0;
  for (const x of xs) sum += Math.exp((x - mx) / tau);
  return mx + tau * Math.log(sum);
}

// Wrapper that adapts the generic `mmrRerank` to the harness's
// Candidate-based signature. Keeps the callsites below readable.
function mmrRerank(
  candidates: Candidate[],
  rel: (c: Candidate) => number,
  k: number,
  poolSize: number,
  lambda: number,
): Candidate[] {
  return mmrRerankGeneric(candidates, (c) => c.vec, rel, {
    k,
    poolSize,
    lambda,
  }).slice(0, k);
}

function distinctTopics(ranked: Candidate[], k: number): number {
  const s = new Set<string>();
  for (const p of ranked.slice(0, k)) if (p.topic) s.add(p.topic);
  return s.size;
}

function longestTopicRun(ranked: Candidate[], k: number): number {
  let best = 0;
  let cur = 0;
  let last: string | null | undefined = undefined;
  for (const p of ranked.slice(0, k)) {
    if (p.topic && p.topic === last) {
      cur++;
    } else {
      if (cur > best) best = cur;
      cur = 1;
      last = p.topic;
    }
  }
  if (cur > best) best = cur;
  return best;
}

function meanRating(ranked: Candidate[], k: number): number {
  const rs = ranked
    .slice(0, k)
    .map((p) => p.rating)
    .filter((r): r is number => r != null);
  if (!rs.length) return 0;
  return rs.reduce((a, b) => a + b, 0) / rs.length;
}

function meanCosToCentroid(
  ranked: Candidate[],
  k: number,
  centroidVec: Float32Array,
): number {
  const slice = ranked.slice(0, k);
  if (!slice.length) return 0;
  let s = 0;
  for (const p of slice) s += cosine(p.vec, centroidVec);
  return s / slice.length;
}

describe.skipIf(!process.env.RECO_DEBUG)("reco strategies (offline)", () => {
  it("compares strategies on the 40-save fixture", () => {
    const { all, byId } = loadCorpus();
    const savedSet = new Set(SAVED_IDS);
    const savedVecs: Float32Array[] = [];
    for (const id of SAVED_IDS) {
      const p = byId.get(id);
      if (p) savedVecs.push(p.vec);
    }
    const candidates = all.filter((p) => !savedSet.has(p.id));

    const cVec = centroid(savedVecs);
    if (!cVec) throw new Error("no saved vecs");
    const clusters = clusterByLeader(
      savedVecs.map((v, i) => ({ id: String(i), vec: v })),
    );

    const strategies: Array<{ name: string; rank: () => Candidate[] }> = [
      {
        name: "centroid (baseline)",
        rank: () =>
          candidates
            .slice()
            .sort((a, b) => cosine(cVec, b.vec) - cosine(cVec, a.vec)),
      },
      {
        name: "cluster-LSE τ=0.3",
        rank: () =>
          candidates
            .slice()
            .sort(
              (a, b) =>
                rankingScoreFromClusters(b.vec, clusters, 0.3) -
                rankingScoreFromClusters(a.vec, clusters, 0.3),
            ),
      },
      {
        name: "cluster-LSE τ=1.0",
        rank: () =>
          candidates
            .slice()
            .sort(
              (a, b) =>
                rankingScoreFromClusters(b.vec, clusters, 1.0) -
                rankingScoreFromClusters(a.vec, clusters, 1.0),
            ),
      },
      {
        name: "cluster-LSE no-size τ=0.3",
        rank: () =>
          candidates
            .slice()
            .sort(
              (a, b) =>
                lseNoSize(b.vec, clusters, 0.3) -
                lseNoSize(a.vec, clusters, 0.3),
            ),
      },
      {
        name: "cluster-LSE + rating γ=0.8",
        rank: () => {
          const score = (c: Candidate) =>
            rankingScoreFromClusters(c.vec, clusters, 0.3) +
            0.8 * qualityPrior(c.rating);
          return candidates.slice().sort((a, b) => score(b) - score(a));
        },
      },
      {
        name: "centroid + MMR λ=0.75",
        rank: () => {
          const rel = (c: Candidate) => cosine(cVec, c.vec);
          return mmrRerank(candidates, rel, 50, 200, 0.75);
        },
      },
      {
        name: "OPINIONATED: cluster-LSE + rating + MMR",
        rank: () => {
          const rel = (c: Candidate) =>
            rankingScoreFromClusters(c.vec, clusters, 0.3) +
            0.8 * qualityPrior(c.rating);
          return mmrRerank(candidates, rel, 50, 200, 0.75);
        },
      },
    ];

    const K = 50;
    console.log(
      `\nRanking ${candidates.length} candidates against ${savedVecs.length} saved (top ${K})\n`,
    );
    console.log(
      "strategy                                  │ topics │ run │ mean★ │ coh  ",
    );
    console.log(
      "──────────────────────────────────────────┼────────┼─────┼───────┼──────",
    );
    const rankedByStrategy: Record<string, Candidate[]> = {};
    for (const s of strategies) {
      const ranked = s.rank();
      rankedByStrategy[s.name] = ranked;
      const topics = distinctTopics(ranked, K);
      const run = longestTopicRun(ranked, K);
      const mr = meanRating(ranked, K);
      const coh = meanCosToCentroid(ranked, K, cVec);
      console.log(
        `${s.name.padEnd(41)} │ ${String(topics).padStart(6)} │ ${String(run).padStart(3)} │ ${mr.toFixed(2).padStart(5)} │ ${coh.toFixed(3).padStart(5)}`,
      );
    }

    // Qualitative dump: top 12 titles per strategy so we can eyeball
    // relevance, garbage, and whether blocks are meaningful.
    for (const s of strategies) {
      const ranked = rankedByStrategy[s.name];
      console.log(`\n── ${s.name} — top 12 ──`);
      for (let i = 0; i < Math.min(12, ranked.length); i++) {
        const p = ranked[i];
        const r = p.rating == null ? " — " : p.rating.toFixed(1);
        const topic = (p.topic ?? "—").slice(0, 26).padEnd(26);
        const title =
          p.title.length > 60 ? p.title.slice(0, 57) + "…" : p.title;
        console.log(
          `  ${String(i + 1).padStart(2)}. ★${r}  ${topic}  ${title}`,
        );
      }
    }

    console.log(
      `\ncluster sizes: ${clusters
        .map((c) => c.memberIds.length)
        .sort((a, b) => b - a)
        .join(",")}`,
    );
  }, 30_000);
});
