<script setup lang="ts">
import { computed, onActivated, ref, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";

defineOptions({ name: "Explore" });
import { storeToRefs } from "pinia";
import { useUiStore } from "@/stores/ui";
import { usePapersStore } from "@/stores/papers";
import { useSavedStore } from "@/stores/saved";
import { cosine, savedCentroid } from "@/composables/useSimilarity";
import { truncate } from "@/composables/usePapers";
import type { Filters, Paper, Sort } from "@/types";
import PaperRow from "./PaperRow.vue";
import FilterDrawer from "./FilterDrawer.vue";

const PAGE = 50;

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

const savedCentroidVec = computed(() => {
  if (!embeddings.value) return null;
  return savedCentroid(papers.value, savedIds.value, (p) =>
    papersStore.vecFor(p),
  );
});

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
    if (f.minRating && (p.rating == null || p.rating < f.minRating))
      return false;
    if (f.savedOnly && !savedIds.value.has(p.id)) return false;
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
    const centroidVec = savedCentroidVec.value;
    if (centroidVec) {
      copy.sort((a, b) => {
        const va = papersStore.vecFor(a);
        const vb = papersStore.vecFor(b);
        const sa = va ? cosine(centroidVec, va) : -1;
        const sb = vb ? cosine(centroidVec, vb) : -1;
        return sb - sa;
      });
    } else {
      copy.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }
  } else if (s === "similar" && seedVec.value) {
    const seed = seedVec.value;
    const excludeId = seedPaperId.value;
    copy.sort((a, b) => {
      if (a.id === excludeId) return 1;
      if (b.id === excludeId) return -1;
      const va = papersStore.vecFor(a);
      const vb = papersStore.vecFor(b);
      const sa = va ? cosine(seed, va) : -1;
      const sb = vb ? cosine(seed, vb) : -1;
      return sb - sa;
    });
  } else if (s === "rating") {
    copy.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  } else if (s === "time") {
    copy.sort((a, b) =>
      ((a.day || "") + a.start).localeCompare((b.day || "") + b.start),
    );
  } else if (s === "poster_id") {
    copy.sort((a, b) => (a.poster_idx ?? 99999) - (b.poster_idx ?? 99999));
  } else if (s === "spotlight") {
    const rank: Record<string, number> = {
      Spotlight: 0,
      Oral: 1,
      Poster: 2,
    };
    copy.sort((a, b) => (rank[a.tier] ?? 3) - (rank[b.tier] ?? 3));
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
  if (f.minRating)
    out.push({
      key: "mr",
      label: `≥ ${f.minRating.toFixed(1)}`,
      rm: () => ui.setFilters({ ...f, minRating: 0 }),
    });
  if (f.savedOnly)
    out.push({
      key: "sv",
      label: "Saved only",
      rm: () => ui.setFilters({ ...f, savedOnly: false }),
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
      <div class="search">
        <span class="icon">⌕</span>
        <input
          type="text"
          placeholder="Search titles, authors, topics"
          :value="query"
          @input="onQuery"
        />
      </div>
      <button class="pill" :class="{ on: filterCount }" @click="openFilters">
        Filters<template v-if="filterCount"> · {{ filterCount }}</template>
      </button>
    </div>
    <div class="ctrl-row">
      <span class="count-txt">{{ sorted.length }} papers</span>
      <div style="flex: 1" />
      <span class="count-txt">sort:</span>
      <select class="sort-sel" :value="sort" @change="onSort">
        <option value="reco">recommended</option>
        <option v-if="seedPaperId" value="similar">similar to seed</option>
        <option value="rating">avg rating</option>
        <option value="time">chronological</option>
        <option value="poster_id">poster ID</option>
        <option value="spotlight">spotlights first</option>
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
