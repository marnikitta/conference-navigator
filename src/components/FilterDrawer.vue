<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useUiStore } from "@/stores/ui";
import { usePapersStore } from "@/stores/papers";
import { useSavedStore } from "@/stores/saved";
import {
  uniqueClusters,
  uniqueInsts,
  uniqueSessions,
} from "@/composables/usePapers";
import {
  buildRankingContext,
  centroid,
  collectSavedVecs,
} from "@/composables/useSimilarity";
import type { Filters, Paper } from "@/types";

const props = defineProps<{
  papers: Paper[];
  savedCount: number;
}>();

const ui = useUiStore();
const papersStore = usePapersStore();
const saved = useSavedStore();
const { filters } = storeToRefs(ui);
const { dayDefs } = storeToRefs(papersStore);
const { idSet: savedIds } = storeToRefs(saved);

const EVENT_TYPES = [
  "Poster",
  "Oral",
  "Blog Track Poster",
  "Journal Track Poster",
];

const insts = computed(() => uniqueInsts(props.papers));
const sessions = computed(() => uniqueSessions(props.papers));
const minRating = computed(() => filters.value.minRating || 0);

// --- counts per filter option -------------------------------------------

function countBy<K extends string | number>(
  items: Paper[],
  key: (p: Paper) => K | null | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of items) {
    const k = key(p);
    if (k == null || k === "") continue;
    out[String(k)] = (out[String(k)] || 0) + 1;
  }
  return out;
}

const eventTypeCounts = computed(() =>
  countBy(props.papers, (p) => p.event_type),
);
const dayCounts = computed(() => countBy(props.papers, (p) => p.day));
const sessionCounts = computed(() => countBy(props.papers, (p) => p.session));
const clusterCounts = computed(() =>
  countBy(props.papers, (p) => p.topic_cluster),
);
const instCounts = computed<Record<string, number>>(() => {
  const out: Record<string, number> = {};
  for (const p of props.papers) {
    const seen = new Set<string>();
    for (const a of p.authors) {
      if (!a.inst || seen.has(a.inst)) continue;
      seen.add(a.inst);
      out[a.inst] = (out[a.inst] || 0) + 1;
    }
  }
  return out;
});

// --- topic relevance ranking -------------------------------------------

// Same strategy as Explore's reco sort (see RANKING_STRATEGY in
// useSimilarity.ts) so filter order stays consistent with the feed.
const rankCtx = computed(() =>
  buildRankingContext(
    collectSavedVecs(
      props.papers,
      (id) => savedIds.value.has(id),
      (p) => papersStore.vecFor(p),
    ),
  ),
);

const topicCentroids = computed<Record<string, Float32Array>>(() => {
  const buckets: Record<string, Float32Array[]> = {};
  for (const p of props.papers) {
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

interface ClusterOption {
  name: string;
  count: number;
}

// Topics sorted by the active ranking strategy's score on the topic
// centroid. Falls back to alphabetical when saved signal is absent.
const clusters = computed<ClusterOption[]>(() => {
  const names = uniqueClusters(props.papers);
  const counts = clusterCounts.value;
  const ctx = rankCtx.value;
  if (!ctx.active) {
    return names.map((n) => ({ name: n, count: counts[n] || 0 }));
  }
  const cents = topicCentroids.value;
  return names
    .map((n) => ({
      name: n,
      count: counts[n] || 0,
      score: cents[n] ? ctx.score(cents[n]) : -Infinity,
    }))
    .sort((a, b) => b.score - a.score)
    .map(({ name, count }) => ({ name, count }));
});

function isOn<K extends keyof Filters>(
  key: K,
  val: Filters[K] extends Array<infer U> | undefined ? U : never,
): boolean {
  const arr = filters.value[key] as unknown as unknown[] | undefined;
  return (arr || []).includes(val);
}

function toggleOpt<K extends keyof Filters>(
  key: K,
  val: Filters[K] extends Array<infer U> | undefined ? U : never,
) {
  const arr = (filters.value[key] as unknown as unknown[] | undefined) || [];
  const cur = new Set(arr);
  if (cur.has(val)) cur.delete(val);
  else cur.add(val);
  ui.setFilters({ ...filters.value, [key]: Array.from(cur) } as Filters);
}

function setKey<K extends keyof Filters>(key: K, val: Filters[K]) {
  ui.setFilters({ ...filters.value, [key]: val });
}

function onRatingInput(e: Event) {
  const v = parseFloat((e.target as HTMLInputElement).value);
  setKey("minRating", v);
}

function toggleSavedOnly() {
  const on = !filters.value.savedOnly;
  ui.setFilters({ ...filters.value, savedOnly: on, showSaved: false });
}

function toggleShowSaved() {
  const on = !filters.value.showSaved;
  ui.setFilters({ ...filters.value, showSaved: on, savedOnly: false });
}

function reset() {
  ui.setFilters({});
}

function close() {
  ui.closeFilterDrawer();
}
</script>

<template>
  <div class="sheet-overlay" @click="close" />
  <div class="filter-drawer" @click.stop>
    <div class="drawer-head">
      <div class="drawer-title">Filters</div>
      <button class="btn" @click="close">Done</button>
    </div>
    <div class="drawer-body">
      <div class="filt-sec">
        <div class="filt-title">Saved ({{ savedCount }})</div>
        <div class="filt-opts">
          <button
            class="filt-opt"
            :class="{ on: filters.savedOnly }"
            @click="toggleSavedOnly"
          >
            {{ filters.savedOnly ? "✓ Saved only" : "Saved only" }}
          </button>
          <button
            class="filt-opt"
            :class="{ on: filters.showSaved }"
            @click="toggleShowSaved"
          >
            {{ filters.showSaved ? "✓ Show saved" : "Show saved" }}
          </button>
        </div>
      </div>

      <div class="filt-sec">
        <div class="filt-title">Event type</div>
        <div class="filt-opts">
          <button
            v-for="t in EVENT_TYPES"
            :key="t"
            class="filt-opt"
            :class="{ on: isOn('eventTypes', t) }"
            @click="toggleOpt('eventTypes', t)"
          >
            {{ t }}<span class="filt-count">{{ eventTypeCounts[t] || 0 }}</span>
          </button>
        </div>
      </div>

      <div class="filt-sec">
        <div class="filt-title">Day</div>
        <div class="filt-opts">
          <button
            v-for="def in dayDefs"
            :key="def.date"
            class="filt-opt"
            :class="{ on: isOn('days', def.date) }"
            @click="toggleOpt('days', def.date)"
          >
            {{ def.short }} · {{ def.pretty
            }}<span class="filt-count">{{ dayCounts[def.date] || 0 }}</span>
          </button>
        </div>
      </div>

      <div class="filt-sec">
        <div class="filt-title">Session</div>
        <div class="filt-opts">
          <button
            v-for="s in sessions"
            :key="s"
            class="filt-opt"
            :class="{ on: isOn('sessions', s) }"
            @click="toggleOpt('sessions', s)"
          >
            {{ s }}<span class="filt-count">{{ sessionCounts[s] || 0 }}</span>
          </button>
        </div>
      </div>

      <div class="filt-sec">
        <div class="filt-title">
          Min review rating · {{ minRating.toFixed(1) }}
        </div>
        <input
          type="range"
          min="0"
          max="9"
          step="0.25"
          :value="minRating"
          class="slider"
          @input="onRatingInput"
        />
      </div>

      <div class="filt-sec">
        <div class="filt-title">Topic cluster ({{ clusters.length }})</div>
        <div class="filt-opts">
          <button
            v-for="c in clusters"
            :key="c.name"
            class="filt-opt"
            :class="{ on: isOn('clusters', c.name) }"
            @click="toggleOpt('clusters', c.name)"
          >
            {{ c.name }}<span class="filt-count">{{ c.count }}</span>
          </button>
        </div>
      </div>

      <div class="filt-sec">
        <div class="filt-title">Institution ({{ insts.length }})</div>
        <div class="filt-opts filt-opts-scroll">
          <button
            v-for="inst in insts"
            :key="inst"
            class="filt-opt"
            :class="{ on: isOn('insts', inst) }"
            @click="toggleOpt('insts', inst)"
          >
            {{ inst
            }}<span class="filt-count">{{ instCounts[inst] || 0 }}</span>
          </button>
        </div>
      </div>
    </div>
    <div class="drawer-foot">
      <button class="btn" @click="reset">Reset all</button>
      <button class="btn primary" @click="close">Apply</button>
    </div>
  </div>
</template>
