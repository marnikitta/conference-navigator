<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useUiStore } from "@/stores/ui";
import { usePapersStore } from "@/stores/papers";
import {
  uniqueClusters,
  uniqueInsts,
  uniqueSessions,
} from "@/composables/usePapers";
import type { Filters, Paper } from "@/types";

const props = defineProps<{
  papers: Paper[];
  savedCount: number;
}>();

const ui = useUiStore();
const papersStore = usePapersStore();
const { filters } = storeToRefs(ui);
const { dayDefs } = storeToRefs(papersStore);

const EVENT_TYPES = [
  "Poster",
  "Oral",
  "Blog Track Poster",
  "Journal Track Poster",
];

const clusters = computed(() => uniqueClusters(props.papers));
const insts = computed(() => uniqueInsts(props.papers));
const sessions = computed(() => uniqueSessions(props.papers));
const minRating = computed(() => filters.value.minRating || 0);

function isOn<K extends keyof Filters>(
  key: K,
  val: Filters[K] extends Array<infer U> | undefined ? U : never,
): boolean {
  const arr = filters.value[key] as unknown as unknown[] | undefined;
  return (arr || []).includes(val);
}

function toggleOpt<K extends keyof Filters>(
  key: K,
  val: Filters[K] extends Array<infer U> | undefined ? U : never,
) {
  const arr = (filters.value[key] as unknown as unknown[] | undefined) || [];
  const cur = new Set(arr);
  if (cur.has(val)) cur.delete(val);
  else cur.add(val);
  ui.setFilters({ ...filters.value, [key]: Array.from(cur) } as Filters);
}

function setKey<K extends keyof Filters>(key: K, val: Filters[K]) {
  ui.setFilters({ ...filters.value, [key]: val });
}

function onRatingInput(e: Event) {
  const v = parseFloat((e.target as HTMLInputElement).value);
  setKey("minRating", v);
}

function toggleSavedOnly() {
  const on = !filters.value.savedOnly;
  ui.setFilters({ ...filters.value, savedOnly: on, showSaved: false });
}

function toggleShowSaved() {
  const on = !filters.value.showSaved;
  ui.setFilters({ ...filters.value, showSaved: on, savedOnly: false });
}

function reset() {
  ui.setFilters({});
}

function close() {
  ui.closeFilterDrawer();
}
</script>

<template>
  <div class="sheet-overlay" @click="close" />
  <div class="filter-drawer" @click.stop>
    <div class="drawer-head">
      <div class="drawer-title">Filters</div>
      <button class="btn" @click="close">Done</button>
    </div>
    <div class="drawer-body">
      <div class="filt-sec">
        <div class="filt-title">Saved ({{ savedCount }})</div>
        <div class="filt-opts">
          <button
            class="filt-opt"
            :class="{ on: filters.savedOnly }"
            @click="toggleSavedOnly"
          >
            {{ filters.savedOnly ? "✓ Saved only" : "Saved only" }}
          </button>
          <button
            class="filt-opt"
            :class="{ on: filters.showSaved }"
            @click="toggleShowSaved"
          >
            {{ filters.showSaved ? "✓ Show saved" : "Show saved" }}
          </button>
        </div>
      </div>

      <div class="filt-sec">
        <div class="filt-title">Event type</div>
        <div class="filt-opts">
          <button
            v-for="t in EVENT_TYPES"
            :key="t"
            class="filt-opt"
            :class="{ on: isOn('eventTypes', t) }"
            @click="toggleOpt('eventTypes', t)"
          >
            {{ t }}
          </button>
        </div>
      </div>

      <div class="filt-sec">
        <div class="filt-title">Day</div>
        <div class="filt-opts">
          <button
            v-for="def in dayDefs"
            :key="def.date"
            class="filt-opt"
            :class="{ on: isOn('days', def.date) }"
            @click="toggleOpt('days', def.date)"
          >
            {{ def.short }} · {{ def.pretty }}
          </button>
        </div>
      </div>

      <div class="filt-sec">
        <div class="filt-title">Session</div>
        <div class="filt-opts">
          <button
            v-for="s in sessions"
            :key="s"
            class="filt-opt"
            :class="{ on: isOn('sessions', s) }"
            @click="toggleOpt('sessions', s)"
          >
            {{ s }}
          </button>
        </div>
      </div>

      <div class="filt-sec">
        <div class="filt-title">
          Min review rating · {{ minRating.toFixed(1) }}
        </div>
        <input
          type="range"
          min="0"
          max="9"
          step="0.25"
          :value="minRating"
          class="slider"
          @input="onRatingInput"
        />
      </div>

      <div class="filt-sec">
        <div class="filt-title">Topic cluster ({{ clusters.length }})</div>
        <div class="filt-opts">
          <button
            v-for="c in clusters"
            :key="c"
            class="filt-opt"
            :class="{ on: isOn('clusters', c) }"
            @click="toggleOpt('clusters', c)"
          >
            {{ c }}
          </button>
        </div>
      </div>

      <div class="filt-sec">
        <div class="filt-title">Institution ({{ insts.length }})</div>
        <div class="filt-opts filt-opts-scroll">
          <button
            v-for="inst in insts"
            :key="inst"
            class="filt-opt"
            :class="{ on: isOn('insts', inst) }"
            @click="toggleOpt('insts', inst)"
          >
            {{ inst }}
          </button>
        </div>
      </div>
    </div>
    <div class="drawer-foot">
      <button class="btn" @click="reset">Reset all</button>
      <button class="btn primary" @click="close">Apply</button>
    </div>
  </div>
</template>
