<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useUiStore } from "@/stores/ui";
import { useSavedStore } from "@/stores/saved";

const ui = useUiStore();
const saved = useSavedStore();
const { tab } = storeToRefs(ui);
const { savedIds } = storeToRefs(saved);
</script>

<template>
  <div class="tabs">
    <button
      class="tab"
      :class="{ active: tab === 'schedule' }"
      @click="ui.setTab('schedule')"
    >
      My schedule
      <span v-if="savedIds.length" class="count">{{ savedIds.length }}</span>
    </button>
    <button
      class="tab"
      :class="{ active: tab === 'explore' }"
      @click="ui.setTab('explore')"
    >
      Explore
    </button>
  </div>
</template>
