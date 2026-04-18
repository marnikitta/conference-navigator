import { defineStore } from "pinia";
import { ref } from "vue";
import type { Day, Filters, Sort, Tab } from "@/types";

export const useUiStore = defineStore("ui", () => {
  const tab = ref<Tab>("schedule");
  const openPaperId = ref<string | null>(null);
  const filters = ref<Filters>({});
  const sort = ref<Sort>("reco");
  const seedPaperId = ref<string | null>(null);
  const query = ref("");
  const scheduleDay = ref<Day>("Thu");
  const filterDrawerOpen = ref(false);
  const exportOpen = ref(false);

  function setTab(t: Tab) {
    tab.value = t;
  }

  function setSort(s: Sort) {
    sort.value = s;
    if (s !== "similar") seedPaperId.value = null;
  }

  function setQuery(q: string) {
    query.value = q;
  }

  function setFilters(f: Filters | null | undefined) {
    filters.value = f || {};
  }

  function setScheduleDay(d: Day) {
    scheduleDay.value = d;
  }

  function openPaper(id: string) {
    openPaperId.value = id;
  }

  function closePaper() {
    openPaperId.value = null;
  }

  function openFilterDrawer() {
    filterDrawerOpen.value = true;
  }

  function closeFilterDrawer() {
    filterDrawerOpen.value = false;
  }

  function openExport() {
    exportOpen.value = true;
  }

  function closeExport() {
    exportOpen.value = false;
  }

  function clearSeed() {
    seedPaperId.value = null;
    if (sort.value === "similar") sort.value = "reco";
  }

  function applyExploreFilter(patch: Filters) {
    filters.value = patch || {};
    openPaperId.value = null;
    tab.value = "explore";
  }

  function showAllSimilar(id: string) {
    seedPaperId.value = id;
    sort.value = "similar";
    filters.value = {};
    openPaperId.value = null;
    tab.value = "explore";
  }

  return {
    tab,
    openPaperId,
    filters,
    sort,
    seedPaperId,
    query,
    scheduleDay,
    filterDrawerOpen,
    exportOpen,
    setTab,
    setSort,
    setQuery,
    setFilters,
    setScheduleDay,
    openPaper,
    closePaper,
    openFilterDrawer,
    closeFilterDrawer,
    openExport,
    closeExport,
    clearSeed,
    applyExploreFilter,
    showAllSimilar,
  };
});
