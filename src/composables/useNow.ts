import { ref, onMounted, onUnmounted } from "vue";

// Shared reactive "wall-clock now" that ticks every 30s while any component
// is mounted. Used to highlight in-progress sessions without re-rendering
// the whole schedule every frame.
const TICK_MS = 30_000;
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;
let refCount = 0;

export function useNow() {
  onMounted(() => {
    refCount++;
    if (!timer) {
      now.value = Date.now();
      timer = setInterval(() => {
        now.value = Date.now();
      }, TICK_MS);
    }
  });
  onUnmounted(() => {
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  });
  return now;
}

export function isLive(
  startMs: number | null | undefined,
  endMs: number | null | undefined,
  nowMs: number,
): boolean {
  if (startMs == null || endMs == null) return false;
  return nowMs >= startMs && nowMs <= endMs;
}
