<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { usePapersStore } from "@/stores/papers";
import Topbar from "@/components/Topbar.vue";
import Tabs from "@/components/Tabs.vue";

const papers = usePapersStore();
const { loaded, loadError } = storeToRefs(papers);

// Publish the sticky header's height as --app-header-h so .day-tabs
// (and any other secondary sticky) can stack below it without guessing.
const headerEl = ref<HTMLElement | null>(null);
let ro: ResizeObserver | null = null;
onMounted(() => {
  if (!headerEl.value) return;
  const apply = () => {
    document.documentElement.style.setProperty(
      "--app-header-h",
      `${headerEl.value!.offsetHeight}px`,
    );
  };
  apply();
  ro = new ResizeObserver(apply);
  ro.observe(headerEl.value);
});
onUnmounted(() => ro?.disconnect());
</script>

<template>
  <div class="app density-comfy">
    <div class="app-header" ref="headerEl">
      <Topbar />
      <Tabs />
    </div>
    <div v-if="loadError" class="empty">
      <span class="mark">Couldn't load papers</span>
      <div>{{ loadError }}</div>
    </div>
    <div v-else-if="!loaded" class="empty">
      <span class="mark">Loading…</span>
    </div>
    <router-view v-else v-slot="{ Component }">
      <keep-alive :include="['Explore', 'Schedule']">
        <component :is="Component" />
      </keep-alive>
    </router-view>
  </div>
</template>
