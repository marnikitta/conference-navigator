import { defineStore } from "pinia";
import { computed, ref } from "vue";
import router from "@/router";
import type { Day, Filters, Sort, Tab } from "@/types";

type QueryValue = string | string[] | undefined | null;
type QueryOut = Record<string, string | string[]>;

interface FilterCodec<K extends keyof Filters> {
  key: K;
  urlKey: string;
  kind: "array" | "bool" | "number";
}

// One source of truth for filter ⇄ URL mapping. Adding a filter means one
// new row here and a new field on `Filters` in types.ts.
const FILTER_CODECS: FilterCodec<keyof Filters>[] = [
  { key: "days", urlKey: "day", kind: "array" },
  { key: "eventTypes", urlKey: "event", kind: "array" },
  { key: "clusters", urlKey: "cluster", kind: "array" },
  { key: "insts", urlKey: "inst", kind: "array" },
  { key: "sessions", urlKey: "session", kind: "array" },
  { key: "spotlightOnly", urlKey: "spotlight", kind: "bool" },
  { key: "minRating", urlKey: "minRating", kind: "number" },
  { key: "savedOnly", urlKey: "saved", kind: "bool" },
];

const FILTER_URL_KEYS = new Set(FILTER_CODECS.map((c) => c.urlKey));
// "similar" is implicit — if `seed` is in the URL, sort IS similar. It's
// never written into the URL directly.
const ALLOWED_SORTS: Sort[] = [
  "reco",
  "rating",
  "time",
  "poster_id",
  "spotlight",
];

function arrayParam(v: unknown): string[] {
  if (v == null) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.filter((x): x is string => typeof x === "string" && x.length > 0);
}

function stringParam(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function numberParam(v: unknown): number | undefined {
  const s = stringParam(v);
  if (s == null) return undefined;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

function parseFilters(q: Record<string, unknown>): Filters {
  const f: Record<string, unknown> = {};
  for (const c of FILTER_CODECS) {
    const v = q[c.urlKey];
    if (c.kind === "array") {
      const arr = arrayParam(v);
      if (arr.length) f[c.key] = arr;
    } else if (c.kind === "bool") {
      if (stringParam(v) === "1") f[c.key] = true;
    } else {
      const n = numberParam(v);
      if (n != null && n > 0) f[c.key] = n;
    }
  }
  return f as Filters;
}

function filtersToQuery(f: Filters): QueryOut {
  const out: QueryOut = {};
  const src = f as Record<string, unknown>;
  for (const c of FILTER_CODECS) {
    const v = src[c.key];
    if (c.kind === "array") {
      if (Array.isArray(v) && v.length) out[c.urlKey] = [...(v as string[])];
    } else if (c.kind === "bool") {
      if (v) out[c.urlKey] = "1";
    } else if (typeof v === "number" && v > 0) {
      out[c.urlKey] = String(v);
    }
  }
  return out;
}

function canonicalQuery(q: Record<string, QueryValue>): QueryOut {
  const out: QueryOut = {};
  for (const k of Object.keys(q).sort()) {
    const v = q[k];
    if (v == null) continue;
    if (Array.isArray(v)) {
      if (v.length) out[k] = v;
    } else if (v !== "") {
      out[k] = v;
    }
  }
  return out;
}

export const useUiStore = defineStore("ui", () => {
  const route = router.currentRoute;

  const scheduleDay = ref<Day>("");
  const filterDrawerOpen = ref(false);

  const tab = computed<Tab>(() =>
    route.value.path === "/schedule" ? "schedule" : "explore",
  );

  const filters = computed<Filters>(() => parseFilters(route.value.query));
  const query = computed(() => stringParam(route.value.query.q) || "");
  const seedPaperId = computed<string | null>(
    () => stringParam(route.value.query.seed) ?? null,
  );
  const sort = computed<Sort>(() => {
    // Seed in the URL ⇒ sort is implicitly "similar". Otherwise parse `sort`.
    if (seedPaperId.value) return "similar";
    const s = stringParam(route.value.query.sort);
    return s && (ALLOWED_SORTS as string[]).includes(s) ? (s as Sort) : "reco";
  });

  /**
   * Patch the Explore URL query. Keys set to null/undefined/empty are
   * dropped; everything else is kept or overridden. router.replace so
   * filter tweaking doesn't pollute history.
   */
  function patchExplore(patch: Record<string, QueryValue>) {
    const next: Record<string, QueryValue> = { ...route.value.query };
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) {
        delete next[k];
      } else {
        next[k] = v;
      }
    }
    void router.replace({ path: "/", query: canonicalQuery(next) });
  }

  function setTab(t: Tab) {
    if (t === "schedule") void router.push("/schedule");
    else void router.push({ path: "/", query: route.value.query });
  }

  function setScheduleDay(d: Day) {
    scheduleDay.value = d;
  }

  function openPaper(id: string) {
    void router.push(`/paper/${encodeURIComponent(id)}`);
  }

  function openExport() {
    void router.push("/export");
  }

  function openFilterDrawer() {
    filterDrawerOpen.value = true;
  }

  function closeFilterDrawer() {
    filterDrawerOpen.value = false;
  }

  function setSort(s: Sort) {
    // Any sort change drops the seed (so "similar" can only come in via
    // showAllSimilar / direct seed URL). Never emit sort=similar.
    patchExplore({
      sort: s === "reco" || s === "similar" ? null : s,
      seed: null,
    });
  }

  function setQuery(q: string) {
    patchExplore({ q: q || null });
  }

  function setFilters(f: Filters | null | undefined) {
    // Replace filter keys while preserving q / sort / seed.
    const preserved: Record<string, QueryValue> = {};
    for (const [k, v] of Object.entries(route.value.query)) {
      if (!FILTER_URL_KEYS.has(k)) preserved[k] = v as QueryValue;
    }
    void router.replace({
      path: "/",
      query: canonicalQuery({ ...preserved, ...filtersToQuery(f || {}) }),
    });
  }

  function clearSeed() {
    patchExplore({ seed: null });
  }

  function applyExploreFilter(patch: Filters) {
    // Fresh view from the detail page: just the new filter, nothing else.
    void router.push({
      path: "/",
      query: canonicalQuery(filtersToQuery(patch || {})),
    });
  }

  function showAllSimilar(id: string) {
    // Seed alone means "sort by similarity to id". No other params.
    void router.push({ path: "/", query: { seed: id } });
  }

  return {
    tab,
    filters,
    sort,
    seedPaperId,
    query,
    scheduleDay,
    filterDrawerOpen,
    setTab,
    setSort,
    setQuery,
    setFilters,
    setScheduleDay,
    openPaper,
    openFilterDrawer,
    closeFilterDrawer,
    openExport,
    clearSeed,
    applyExploreFilter,
    showAllSimilar,
  };
});
