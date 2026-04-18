<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useUiStore } from "@/stores/ui";
import { usePapersStore } from "@/stores/papers";
import Topbar from "@/components/Topbar.vue";
import Tabs from "@/components/Tabs.vue";
import Explore from "@/components/Explore.vue";
import Schedule from "@/components/Schedule.vue";
import DetailSheet from "@/components/DetailSheet.vue";
import ExportSheet from "@/components/ExportSheet.vue";

const ui = useUiStore();
const { tab } = storeToRefs(ui);
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
    <Explore v-else-if="tab === 'explore'" />
    <Schedule v-else />
    <DetailSheet />
    <ExportSheet />
  </div>
</template>
