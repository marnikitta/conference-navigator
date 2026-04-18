import { defineStore } from "pinia";
import { computed } from "vue";
import { useLocalStorage } from "@vueuse/core";

export const useSavedStore = defineStore("saved", () => {
  const savedIds = useLocalStorage<string[]>("cn_saved", []);
  const idSet = computed(() => new Set(savedIds.value));

  function has(id: string): boolean {
    return idSet.value.has(id);
  }

  function toggle(id: string): void {
    const i = savedIds.value.indexOf(id);
    if (i >= 0) savedIds.value.splice(i, 1);
    else savedIds.value.push(id);
  }

  function importIds(ids: string[]): void {
    savedIds.value = [...ids];
  }

  return { savedIds, idSet, has, toggle, importIds };
});
