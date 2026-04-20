<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { usePapersStore } from "@/stores/papers";
import { useSavedStore } from "@/stores/saved";
import { uniqueClusters } from "@/composables/usePapers";
import {
  buildRankingContext,
  centroid,
  collectSavedVecs,
} from "@/composables/useSimilarity";

const papersStore = usePapersStore();
const saved = useSavedStore();
const { papers } = storeToRefs(papersStore);
const { idSet: savedIds } = storeToRefs(saved);

interface Row {
  name: string;
  total: number;
  saved: number;
}

// Rank topics with the "clusters" strategy (LSE over leader-clusters
// of the saved set) — matches the filter drawer, and unlike
// "opinionated" has no jitter so the ordering is stable across visits.
// Falls back to alphabetical when there's no saved signal yet.
const rankCtx = computed(() =>
  buildRankingContext(
    collectSavedVecs(
      papers.value,
      (id) => savedIds.value.has(id),
      (p) => papersStore.vecFor(p),
    ),
    "clusters",
  ),
);

const topicCentroids = computed<Record<string, Float32Array>>(() => {
  const buckets: Record<string, Float32Array[]> = {};
  for (const p of papers.value) {
    const t = p.topic_cluster;
    if (!t) continue;
    const v = papersStore.vecFor(p);
    if (!v) continue;
    (buckets[t] ??= []).push(v);
  }
  const out: Record<string, Float32Array> = {};
  for (const [t, vecs] of Object.entries(buckets)) {
    const c = centroid(vecs);
    if (c) out[t] = c;
  }
  return out;
});

const rows = computed<Row[]>(() => {
  const names = uniqueClusters(papers.value);
  const totals: Record<string, number> = {};
  const savedCounts: Record<string, number> = {};
  for (const p of papers.value) {
    const t = p.topic_cluster;
    if (!t) continue;
    totals[t] = (totals[t] || 0) + 1;
    if (savedIds.value.has(p.id)) savedCounts[t] = (savedCounts[t] || 0) + 1;
  }
  const ctx = rankCtx.value;
  const cents = topicCentroids.value;
  const scored = names.map((n) => ({
    name: n,
    total: totals[n] || 0,
    saved: savedCounts[n] || 0,
    score: ctx.active && cents[n] ? ctx.score(cents[n]) : -Infinity,
  }));
  scored.sort((a, b) =>
    ctx.active ? b.score - a.score : a.name.localeCompare(b.name),
  );
  return scored.map(({ name, total, saved }) => ({ name, total, saved }));
});

const totalSaved = computed(() => savedIds.value.size);
</script>

<template>
  <div class="page sitemap">
    <div class="page-head">Topics</div>
    <h1 class="sitemap-title">Topic clusters</h1>
    <p class="sitemap-sub">
      <template v-if="rankCtx.active">
        Sorted by similarity to your {{ totalSaved }} saved paper{{
          totalSaved === 1 ? "" : "s"
        }}. Middle-click to open in a new tab.
      </template>
      <template v-else>
        Save some papers first and this list will re-rank by preference.
        Middle-click to open in a new tab.
      </template>
    </p>
    <ul class="sitemap-list">
      <li v-for="r in rows" :key="r.name">
        <router-link
          class="sitemap-link"
          :to="{ path: '/', query: { cluster: r.name } }"
        >
          <span class="sitemap-name">{{ r.name }}</span>
          <span class="sitemap-count">{{ r.saved }}/{{ r.total }}</span>
        </router-link>
      </li>
    </ul>
  </div>
</template>
