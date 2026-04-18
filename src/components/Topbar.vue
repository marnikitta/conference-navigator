<script setup lang="ts">
import { useUiStore } from "@/stores/ui";

const ui = useUiStore();
</script>

<template>
  <div class="topbar">
    <div class="brand">
      <span class="mark">Navigator</span>
      <span class="sub">ICLR 2026 · Vancouver</span>
    </div>
    <button class="topbar-link" @click="ui.openExport">Export / Import</button>
  </div>
</template>
