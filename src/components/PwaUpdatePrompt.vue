<script setup lang="ts">
import { ref } from "vue";
import { registerSW } from "virtual:pwa-register";

const needRefresh = ref(false);
const offlineReady = ref(false);

const updateSW = registerSW({
  onNeedRefresh() {
    needRefresh.value = true;
  },
  onOfflineReady() {
    offlineReady.value = true;
    setTimeout(() => (offlineReady.value = false), 4000);
  },
});

function reload() {
  void updateSW(true);
}

function dismiss() {
  needRefresh.value = false;
  offlineReady.value = false;
}
</script>

<template>
  <div
    v-if="needRefresh || offlineReady"
    class="pwa-toast"
    role="status"
    aria-live="polite"
  >
    <template v-if="needRefresh">
      <span class="pwa-toast-msg">New version available</span>
      <button class="pwa-toast-btn primary" @click="reload">Reload</button>
      <button class="pwa-toast-btn" @click="dismiss" aria-label="Dismiss">
        ×
      </button>
    </template>
    <template v-else>
      <span class="pwa-toast-msg">Ready to work offline</span>
      <button class="pwa-toast-btn" @click="dismiss" aria-label="Dismiss">
        ×
      </button>
    </template>
  </div>
</template>

<style scoped>
.pwa-toast {
  position: fixed;
  left: 50%;
  bottom: max(16px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px 10px 16px;
  background: var(--ink);
  color: var(--bg);
  border-radius: 10px;
  font-size: var(--fs-sm);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
  z-index: 1000;
  max-width: calc(100vw - 32px);
}
.pwa-toast-msg {
  white-space: nowrap;
}
.pwa-toast-btn {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: var(--fs-sm);
  color: var(--bg);
}
.pwa-toast-btn.primary {
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 600;
}
.pwa-toast-btn:not(.primary) {
  color: var(--bg);
  opacity: 0.7;
}
.pwa-toast-btn:not(.primary):hover {
  opacity: 1;
}
</style>
