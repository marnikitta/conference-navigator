<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useUiStore } from "@/stores/ui";

const ui = useUiStore();
const { tab } = storeToRefs(ui);
</script>

<template>
  <div class="tabs">
    <button
      class="tab"
      :class="{ active: tab === 'schedule' }"
      @click="ui.setTab('schedule')"
    >
      My schedule
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
