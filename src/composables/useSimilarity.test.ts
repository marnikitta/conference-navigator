import { describe, it, expect } from "vitest";
import {
  CLUSTER_THRESHOLD,
  type Cluster,
  clusterByLeader,
  cosine,
  mmrRerank,
  qualityPrior,
  rankingScoreFromClusters,
} from "./useSimilarity";

// Build a unit-length 2D vector at angle θ (radians), padded to length 4.
// Pairs of such vectors have cosine == cos(θ_a - θ_b) exactly, which lets
// tests pick thresholds without floating-point drift.
function vecAt(theta: number): Float32Array {
  return new Float32Array([Math.cos(theta), Math.sin(theta), 0, 0]);
}

// cos⁻¹(0.7) — two vectors this far apart are exactly at threshold.
const THETA_AT_THRESHOLD = Math.acos(CLUSTER_THRESHOLD);

function isUnit(v: Float32Array, eps = 1e-6): boolean {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.abs(Math.sqrt(s) - 1) < eps;
}

describe("clusterByLeader", () => {
  it("returns [] for empty input", () => {
    expect(clusterByLeader([])).toEqual([]);
  });

  it("creates a single cluster for one item with unit-length centroid", () => {
    const v = vecAt(0.3);
    const clusters = clusterByLeader([{ id: "a", vec: v }]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].memberIds).toEqual(["a"]);
    expect(isUnit(clusters[0].centroid)).toBe(true);
  });

  it("merges two identical vectors into one cluster", () => {
    const v = vecAt(0);
    const clusters = clusterByLeader([
      { id: "a", vec: v },
      { id: "b", vec: v },
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].memberIds).toEqual(["a", "b"]);
  });

  it("splits orthogonal vectors into separate clusters", () => {
    const clusters = clusterByLeader([
      { id: "a", vec: vecAt(0) },
      { id: "b", vec: vecAt(Math.PI / 2) },
    ]);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].memberIds).toEqual(["a"]);
    expect(clusters[1].memberIds).toEqual(["b"]);
  });

  it("joins at exactly the threshold (>= semantics)", () => {
    // Construct a dot product that is *exactly* 0.5 in Float32, then use
    // 0.5 as the threshold so the `>=` edge is hit without FP drift.
    const a = new Float32Array([1, 0, 0, 0]);
    const b = new Float32Array([0.5, Math.sqrt(0.75), 0, 0]);
    const clusters = clusterByLeader(
      [
        { id: "a", vec: a },
        { id: "b", vec: b },
      ],
      0.5,
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].memberIds).toEqual(["a", "b"]);
  });

  it("splits just under the threshold", () => {
    // Small epsilon past the threshold angle → cosine < 0.7.
    const clusters = clusterByLeader([
      { id: "a", vec: vecAt(0) },
      { id: "b", vec: vecAt(THETA_AT_THRESHOLD + 1e-3) },
    ]);
    expect(clusters).toHaveLength(2);
  });

  it("respects a custom (tighter) threshold", () => {
    // Pair has cosine ≈ 0.8; at default (0.7) they cluster, at 0.9 they split.
    const theta = Math.acos(0.8);
    const items = [
      { id: "a", vec: vecAt(0) },
      { id: "b", vec: vecAt(theta) },
    ];
    expect(clusterByLeader(items, 0.7)).toHaveLength(1);
    expect(clusterByLeader(items, 0.9)).toHaveLength(2);
  });

  it("assigns a bridge vector to its best match, not the first match", () => {
    // v1 at 0, v2 orthogonal, v3 close to v1. v3 must join v1's cluster.
    const clusters = clusterByLeader([
      { id: "v1", vec: vecAt(0) },
      { id: "v2", vec: vecAt(Math.PI / 2) },
      { id: "v3", vec: vecAt(0.1) },
    ]);
    expect(clusters).toHaveLength(2);
    const withV3 = clusters.find((c) => c.memberIds.includes("v3"));
    expect(withV3?.memberIds).toEqual(["v1", "v3"]);
  });

  it("keeps the centroid unit-length after each merge", () => {
    const clusters = clusterByLeader([
      { id: "a", vec: vecAt(0) },
      { id: "b", vec: vecAt(0.2) },
      { id: "c", vec: vecAt(0.4) },
    ]);
    expect(clusters).toHaveLength(1);
    expect(isUnit(clusters[0].centroid)).toBe(true);
  });

  it("preserves insertion order in memberIds", () => {
    // Greedy single-pass: members are appended in the order they arrive.
    const clusters = clusterByLeader([
      { id: "first", vec: vecAt(0) },
      { id: "second", vec: vecAt(0.1) },
      { id: "third", vec: vecAt(0.2) },
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].memberIds).toEqual(["first", "second", "third"]);
  });
});

// Build a cluster synthetically so the member count can be set without
// having to construct enough near-duplicate vectors to force clustering.
function makeCluster(axis: Float32Array, size: number): Cluster {
  return {
    centroid: axis,
    memberIds: Array.from({ length: size }, (_, i) => `m${i}`),
    memberVecs: Array.from({ length: size }, () => axis),
  };
}

describe("rankingScoreFromClusters", () => {
  it("returns -Infinity for a null vec", () => {
    const clusters = [makeCluster(vecAt(0), 5)];
    expect(rankingScoreFromClusters(null, clusters)).toBe(-Infinity);
    expect(rankingScoreFromClusters(undefined, clusters)).toBe(-Infinity);
  });

  it("returns -Infinity when clusters is empty", () => {
    expect(rankingScoreFromClusters(vecAt(0), [])).toBe(-Infinity);
  });

  it("ignores singleton clusters", () => {
    // Only a singleton exists → nothing to score against.
    const clusters = [makeCluster(vecAt(0), 1)];
    expect(rankingScoreFromClusters(vecAt(0), clusters)).toBe(-Infinity);
  });

  it("scores a 2-member cluster at cosine × log(3)", () => {
    const clusters = [makeCluster(vecAt(0), 2)];
    const score = rankingScoreFromClusters(vecAt(0), clusters);
    expect(score).toBeCloseTo(Math.log(3), 6); // cosine=1 × log(1+2)
  });

  it("favors a larger cluster even at lower cosine (τ→0 recovers max)", () => {
    // Small cluster aligned with the query, larger cluster slightly off.
    // log-weight on the large one wins at hard max:
    //   small: cos(0) × log(3) = 1 × 1.0986 = 1.0986
    //   large: cos(π/4) × log(11) = 0.7071 × 2.3979 = 1.6957
    const small = makeCluster(vecAt(0), 2);
    const large = makeCluster(vecAt(Math.PI / 4), 10);
    const score = rankingScoreFromClusters(vecAt(0), [small, large], 1e-4);
    expect(score).toBeCloseTo(Math.cos(Math.PI / 4) * Math.log(11), 4);
  });

  it("small cluster can still win when query aligns closely with it (τ→0)", () => {
    // Small, perfectly aligned vs. large, orthogonal.
    //   small: 1 × log(3) ≈ 1.0986
    //   large: 0 × log(21) = 0
    const small = makeCluster(vecAt(0), 2);
    const large = makeCluster(vecAt(Math.PI / 2), 20);
    const score = rankingScoreFromClusters(vecAt(0), [small, large], 1e-4);
    expect(score).toBeCloseTo(Math.log(3), 4);
  });

  it("LSE blends clusters as τ grows", () => {
    // With two competing non-singleton clusters, LSE with τ>0 returns a
    // score strictly greater than the hard max — that's the smoothing.
    const small = makeCluster(vecAt(0), 2);
    const large = makeCluster(vecAt(Math.PI / 4), 10);
    const xSmall = 1 * Math.log(3);
    const xLarge = Math.cos(Math.PI / 4) * Math.log(11);
    const hardMax = Math.max(xSmall, xLarge);
    const scoreLow = rankingScoreFromClusters(vecAt(0), [small, large], 1e-4);
    const scoreMid = rankingScoreFromClusters(vecAt(0), [small, large], 0.3);
    const scoreHigh = rankingScoreFromClusters(vecAt(0), [small, large], 5);
    expect(scoreLow).toBeCloseTo(hardMax, 4);
    expect(scoreMid).toBeGreaterThan(hardMax);
    expect(scoreHigh).toBeGreaterThan(scoreMid);
  });

  it("treats singleton + non-singleton mix as if the singleton weren't there", () => {
    const singleton = makeCluster(vecAt(0), 1);
    const pair = makeCluster(vecAt(Math.PI / 3), 2);
    const score = rankingScoreFromClusters(vecAt(Math.PI / 3), [
      singleton,
      pair,
    ]);
    // Should equal just the pair's score (cosine 1 × log 3).
    expect(score).toBeCloseTo(Math.log(3), 5);
  });
});

describe("qualityPrior", () => {
  it("maps 5.0 → 0 and 7.0 → 1 with linear slope between", () => {
    expect(qualityPrior(5)).toBeCloseTo(0, 6);
    expect(qualityPrior(6)).toBeCloseTo(0.5, 6);
    expect(qualityPrior(7)).toBeCloseTo(1, 6);
  });

  it("clips below 5 and above 7", () => {
    expect(qualityPrior(3)).toBe(0);
    expect(qualityPrior(9)).toBe(1);
  });

  it("returns a mild 0.3 default when rating is missing", () => {
    expect(qualityPrior(null)).toBe(0.3);
  });
});

describe("mmrRerank", () => {
  it("picks the most relevant first", () => {
    const items = [
      { id: "a", vec: vecAt(0), rel: 0.1 },
      { id: "b", vec: vecAt(Math.PI / 2), rel: 0.9 },
    ];
    const out = mmrRerank(
      items,
      (x) => x.vec,
      (x) => x.rel,
      { k: 2, poolSize: 10, lambda: 0.7 },
    );
    expect(out.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("prefers a distant-but-lower-rel item over a near-duplicate of the head (λ low)", () => {
    // Three candidates: H (head, rel 1.0), N (near-dup of H, rel 0.95),
    // F (far from H, rel 0.8). With λ=0.3, MMR should pick F second.
    const items = [
      { id: "H", vec: vecAt(0), rel: 1.0 },
      { id: "N", vec: vecAt(0.01), rel: 0.95 },
      { id: "F", vec: vecAt(Math.PI / 2), rel: 0.8 },
    ];
    const out = mmrRerank(
      items,
      (x) => x.vec,
      (x) => x.rel,
      { k: 2, poolSize: 10, lambda: 0.3 },
    );
    expect(out.slice(0, 2).map((x) => x.id)).toEqual(["H", "F"]);
  });

  it("keeps near-duplicate second when λ=1 (pure relevance)", () => {
    const items = [
      { id: "H", vec: vecAt(0), rel: 1.0 },
      { id: "N", vec: vecAt(0.01), rel: 0.95 },
      { id: "F", vec: vecAt(Math.PI / 2), rel: 0.8 },
    ];
    const out = mmrRerank(
      items,
      (x) => x.vec,
      (x) => x.rel,
      { k: 2, poolSize: 10, lambda: 1 },
    );
    expect(out.slice(0, 2).map((x) => x.id)).toEqual(["H", "N"]);
  });

  it("sends vec-less items to the tail", () => {
    const items = [
      { id: "a", vec: vecAt(0), rel: 0.5 },
      { id: "b", vec: null as unknown as Float32Array | null, rel: 0.9 },
      { id: "c", vec: vecAt(Math.PI / 2), rel: 0.2 },
    ];
    const out = mmrRerank(
      items,
      (x) => x.vec,
      (x) => x.rel,
      { k: 2, poolSize: 10, lambda: 0.7 },
    );
    expect(out[out.length - 1].id).toBe("b");
  });
});
