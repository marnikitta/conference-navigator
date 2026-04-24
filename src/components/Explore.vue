<script setup lang="ts">
import { computed, onActivated, ref, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";

defineOptions({ name: "Explore" });
import { storeToRefs } from "pinia";
import { useUiStore } from "@/stores/ui";
import { usePapersStore } from "@/stores/papers";
import { useSavedStore } from "@/stores/saved";
import {
  cosine,
  buildRankingContext,
  collectSavedVecs,
  type RankingContext,
} from "@/composables/useSimilarity";
import { truncate } from "@/composables/usePapers";
import type { Filters, Paper, Sort } from "@/types";
import PaperRow from "./PaperRow.vue";
import FilterDrawer from "./FilterDrawer.vue";

const PAGE = 500;

const ui = useUiStore();
const papersStore = usePapersStore();
const saved = useSavedStore();
const { filters, sort, query, filterDrawerOpen, seedPaperId } = storeToRefs(ui);
const { papers, embeddings } = storeToRefs(papersStore);
const { idSet: savedIds } = storeToRefs(saved);

const shown = ref(PAGE);

const savedPapers = computed(() =>
  papers.value.filter((p) => savedIds.value.has(p.id)),
);

// IDs that were already saved when the user started this browsing
// session. When "Show saved" is off we only hide papers in this baseline
// — anything the user saves *while browsing* stays visible, so the row
// doesn't vanish the moment they click save. The ref is kept alive with
// the component, so it only resets on a full page reload.
const savedBaseline = ref<Set<string>>(new Set(savedIds.value));

// Snapshot of the ranking context used by `reco`, plus a pre-computed
// order of every paper under that context. The snapshot is taken once
// per page load and deliberately *not* refreshed when the user saves
// or unsaves a paper — otherwise the feed reshuffles in-place while
// they're reading it. A page reload (or the embeddings first arriving)
// gets a fresh snapshot; until then, filter/sort/query tweaks reuse
// the cached order via `rankOrder`. The active strategy is a
// code-level toggle in `useSimilarity.ts` — see `RANKING_STRATEGY`.
const rankCtx = ref<RankingContext | null>(null);
const rankOrder = ref<Map<string, number>>(new Map());
function snapshotRanking() {
  if (!embeddings.value) {
    rankCtx.value = null;
    rankOrder.value = new Map();
    return;
  }
  const t0 = performance.now();
  const vecs = collectSavedVecs(
    papers.value,
    (id) => savedIds.value.has(id),
    (p) => papersStore.vecFor(p),
  );
  const ctx = buildRankingContext(vecs);
  rankCtx.value = ctx;
  if (!ctx.active) {
    rankOrder.value = new Map();
    return;
  }
  const ordered = ctx.rerank
    ? ctx.rerank(
        papers.value,
        (p) => papersStore.vecFor(p),
        (p) => p.rating,
      )
    : papers.value.slice().sort((a, b) => {
        const sa = ctx.score(papersStore.vecFor(a));
        const sb = ctx.score(papersStore.vecFor(b));
        return sb - sa;
      });
  const map = new Map<string, number>();
  for (let i = 0; i < ordered.length; i++) map.set(ordered[i].id, i);
  rankOrder.value = map;
  if (vecs.length > 0) {
    console.log(ctx.describe());
    if (ctx.diagnose) {
      const topItems = ordered.slice(0, 100).map((p) => ({
        vec: papersStore.vecFor(p),
        rating: p.rating,
      }));
      ctx.diagnose(topItems);
    }
    console.log(
      `[reco] snapshot built in ${(performance.now() - t0).toFixed(1)}ms`,
    );
  }
}
snapshotRanking();
watch(embeddings, snapshotRanking);

const seedPaper = computed<Paper | null>(() => {
  if (!seedPaperId.value) return null;
  return papers.value.find((p) => p.id === seedPaperId.value) || null;
});

const seedVec = computed(() =>
  seedPaper.value ? papersStore.vecFor(seedPaper.value) : null,
);

const filtered = computed<Paper[]>(() => {
  const f = filters.value;
  const q = query.value.trim().toLowerCase();
  return papers.value.filter((p) => {
    if (q) {
      const hit =
        p.title.toLowerCase().includes(q) ||
        p.authors.some(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            (a.inst || "").toLowerCase().includes(q),
        ) ||
        (p.topic_cluster || "").toLowerCase().includes(q);
      if (!hit) return false;
    }
    if (f.days?.length && (!p.day || !f.days.includes(p.day))) return false;
    if (
      f.eventTypes?.length &&
      (!p.event_type || !f.eventTypes.includes(p.event_type))
    )
      return false;
    if (f.spotlightOnly && p.tier !== "Spotlight") return false;
    if (f.savedOnly && !savedIds.value.has(p.id)) return false;
    // Saved papers are hidden by default; "Show saved" opts back in.
    // `savedOnly` implies saved are visible regardless. Papers saved
    // during this session (not in `savedBaseline`) stay visible so new
    // saves don't disappear while the user is still browsing.
    if (
      !f.savedOnly &&
      !f.showSaved &&
      savedIds.value.has(p.id) &&
      savedBaseline.value.has(p.id)
    )
      return false;
    if (
      f.clusters?.length &&
      (!p.topic_cluster || !f.clusters.includes(p.topic_cluster))
    )
      return false;
    if (f.insts?.length && !p.authors.some((a) => f.insts!.includes(a.inst)))
      return false;
    if (f.sessions?.length && (!p.session || !f.sessions.includes(p.session)))
      return false;
    return true;
  });
});

const sorted = computed<Paper[]>(() => {
  const copy = filtered.value.slice();
  const s = sort.value;
  if (s === "reco") {
    const ctx = rankCtx.value;
    const order = rankOrder.value;
    if (ctx?.active && order.size > 0) {
      copy.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
    } else {
      copy.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }
  } else if (s === "similar" && seedVec.value) {
    const seed = seedVec.value;
    copy.sort((a, b) => {
      const va = papersStore.vecFor(a);
      const vb = papersStore.vecFor(b);
      const sa = va ? cosine(seed, va) : -1;
      const sb = vb ? cosine(seed, vb) : -1;
      return sb - sa;
    });
  } else if (s === "rating") {
    copy.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  } else if (s === "time") {
    copy.sort((a, b) => {
      const ta = a.start?.getTime() ?? Number.POSITIVE_INFINITY;
      const tb = b.start?.getTime() ?? Number.POSITIVE_INFINITY;
      return ta - tb;
    });
  } else if (s === "poster_id") {
    copy.sort((a, b) => (a.poster_idx ?? 99999) - (b.poster_idx ?? 99999));
  }
  return copy;
});

const visibleSorted = computed(() => sorted.value.slice(0, shown.value));

interface Chip {
  key: string;
  label: string;
  rm: () => void;
}

const chips = computed<Chip[]>(() => {
  const f = filters.value;
  const out: Chip[] = [];
  (f.days || []).forEach((d) =>
    out.push({ key: `day-${d}`, label: d, rm: () => rmFrom("days", d) }),
  );
  (f.eventTypes || []).forEach((t) =>
    out.push({
      key: `et-${t}`,
      label: t,
      rm: () => rmFrom("eventTypes", t),
    }),
  );
  (f.clusters || []).forEach((c) =>
    out.push({
      key: `cl-${c}`,
      label: c,
      rm: () => rmFrom("clusters", c),
    }),
  );
  (f.insts || []).forEach((i) =>
    out.push({ key: `in-${i}`, label: i, rm: () => rmFrom("insts", i) }),
  );
  (f.sessions || []).forEach((s) =>
    out.push({
      key: `ss-${s}`,
      label: truncate(s, 26),
      rm: () => rmFrom("sessions", s),
    }),
  );
  if (f.spotlightOnly)
    out.push({
      key: "spot",
      label: "Spotlight only",
      rm: () => ui.setFilters({ ...f, spotlightOnly: false }),
    });
  if (f.savedOnly)
    out.push({
      key: "sv",
      label: "Saved only",
      rm: () => ui.setFilters({ ...f, savedOnly: false }),
    });
  if (f.showSaved)
    out.push({
      key: "ss-saved",
      label: "Show saved",
      rm: () => ui.setFilters({ ...f, showSaved: false }),
    });
  return out;
});

const filterCount = computed(() => chips.value.length);

const seedChip = computed(() => {
  if (sort.value !== "similar" || !seedPaper.value) return null;
  return `Similar to: ${truncate(seedPaper.value.title, 40)}`;
});

function rmFrom<
  K extends "days" | "eventTypes" | "clusters" | "insts" | "sessions",
>(key: K, val: string) {
  const arr = (filters.value[key] as string[] | undefined) || [];
  const next = { ...filters.value, [key]: arr.filter((x) => x !== val) };
  ui.setFilters(next as Filters);
}

function clearAll() {
  ui.setFilters({});
}

function clearSeed() {
  ui.clearSeed();
}

function onQuery(e: Event) {
  ui.setQuery((e.target as HTMLInputElement).value);
}

function onSort(e: Event) {
  ui.setSort((e.target as HTMLSelectElement).value as Sort);
}

function openFilters() {
  ui.openFilterDrawer();
}

function showMore() {
  shown.value += PAGE;
}

// When Explore is cached by <keep-alive> and the user navigates to
// /paper/:id, Pinia's route-derived filters/query still update, which
// would re-trigger these watchers and reset `shown` to 50 — wiping the
// pagination state the user expects back on return. Gate the reset so
// it fires only while Explore is the active route.
let routeActive = true;
onBeforeRouteLeave(() => {
  routeActive = false;
});
onActivated(() => {
  routeActive = true;
});
const resetShown = () => {
  if (routeActive) shown.value = PAGE;
};
watch(filters, resetShown, { deep: true });
watch(sort, resetShown);
watch(query, resetShown);
watch(seedPaperId, resetShown);
</script>

<template>
  <div class="controls">
    <div class="ctrl-row">
      <div class="search">
        <span class="icon">⌕</span>
        <input
          type="text"
          placeholder="Search titles, authors, topics, institutes"
          :value="query"
          @input="onQuery"
        />
        <button
          v-if="query"
          type="button"
          class="clear"
          aria-label="Clear search"
          @click="ui.setQuery('')"
        >
          ×
        </button>
      </div>
      <button class="pill" :class="{ on: filterCount }" @click="openFilters">
        Filters<template v-if="filterCount"> · {{ filterCount }}</template>
      </button>
    </div>
    <div v-if="seedChip" class="chip-row">
      <button class="chip on" @click="clearSeed">
        {{ seedChip }} <span class="x">×</span>
      </button>
    </div>
    <div v-if="chips.length" class="chip-row">
      <button v-for="c in chips" :key="c.key" class="chip on" @click="c.rm">
        {{ c.label }} <span class="x">×</span>
      </button>
      <button class="chip" @click="clearAll">clear all</button>
    </div>
    <div class="ctrl-row">
      <span class="count-txt">{{ sorted.length }} papers</span>
      <div style="flex: 1" />
      <span class="count-txt">sort:</span>
      <select class="sort-sel" :value="sort" @change="onSort">
        <option value="reco">recommended</option>
        <option v-if="seedPaperId" value="similar">similar to seed</option>
        <option value="rating">review rating</option>
        <option value="time">chronological</option>
        <option value="poster_id">poster ID</option>
      </select>
    </div>
  </div>
  <div class="feed">
    <template v-if="sorted.length === 0">
      <div class="empty">
        <span class="mark">No matches</span>
        Try loosening filters or clearing your search.
      </div>
    </template>
    <template v-else>
      <PaperRow v-for="p in visibleSorted" :key="p.id" :paper="p" />
      <div v-if="shown < sorted.length" class="load-more">
        <button class="btn" @click="showMore">
          Show {{ Math.min(PAGE, sorted.length - shown) }} more
        </button>
        <span class="load-more-count">
          {{ shown }} of {{ sorted.length }}
        </span>
      </div>
    </template>
  </div>
  <FilterDrawer
    v-if="filterDrawerOpen"
    :papers="papers"
    :saved-count="savedPapers.length"
  />
</template>
