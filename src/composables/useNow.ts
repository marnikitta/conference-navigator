import { ref, onMounted, onUnmounted, type Ref } from "vue";

// Shared reactive "wall-clock now" that ticks every 30s while any component
// is mounted. Used to highlight in-progress sessions without re-rendering
// the whole schedule every frame.
const TICK_MS = 30_000;
const now = ref<Date>(new Date());
let timer: ReturnType<typeof setInterval> | null = null;
let refCount = 0;

export function useNow(): Ref<Date> {
  onMounted(() => {
    refCount++;
    if (!timer) {
      now.value = new Date();
      timer = setInterval(() => {
        now.value = new Date();
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
  start: Date | null | undefined,
  end: Date | null | undefined,
  nowAt: Date,
): boolean {
  if (!start || !end) return false;
  return nowAt >= start && nowAt <= end;
}
