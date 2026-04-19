<script setup lang="ts">
import { storeToRefs } from "pinia";
import { usePapersStore } from "@/stores/papers";
import Topbar from "@/components/Topbar.vue";
import Tabs from "@/components/Tabs.vue";

const papers = usePapersStore();
const { loaded, loadError } = storeToRefs(papers);
</script>

<template>
  <div class="app density-comfy">
    <Topbar />
    <Tabs />
    <div v-if="loadError" class="empty">
      <span class="mark">Couldn't load papers</span>
      <div>{{ loadError }}</div>
    </div>
    <div v-else-if="!loaded" class="empty">
      <span class="mark">Loading…</span>
    </div>
    <router-view v-else />
  </div>
</template>
