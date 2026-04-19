<script setup lang="ts">
import { computed, watchEffect } from "vue";

defineOptions({ name: "Schedule" });
import { storeToRefs } from "pinia";
import { useUiStore } from "@/stores/ui";
import { usePapersStore } from "@/stores/papers";
import { useSavedStore } from "@/stores/saved";
import { groupBySession, tierText, tierClass } from "@/composables/usePapers";
import type { Day, Paper, SessionGroup } from "@/types";

const ui = useUiStore();
const papersStore = usePapersStore();
const saved = useSavedStore();
const { scheduleDay: day } = storeToRefs(ui);
const { papers, dayDefs } = storeToRefs(papersStore);
const { idSet: savedIds } = storeToRefs(saved);

// Default the active day to the first conference day as soon as data lands.
watchEffect(() => {
  if (!day.value && dayDefs.value.length) {
    ui.setScheduleDay(dayDefs.value[0].date);
  }
});

const savedPapers = computed<Paper[]>(() =>
  papers.value.filter((p) => savedIds.value.has(p.id)),
);

const byDay = computed<Record<Day, Paper[]>>(() => {
  const res: Record<Day, Paper[]> = {};
  for (const def of dayDefs.value) {
    res[def.date] = savedPapers.value.filter((p) => p.day === def.date);
  }
  return res;
});

const curPapers = computed<Paper[]>(() => byDay.value[day.value] || []);

const sessions = computed<SessionGroup[]>(() => {
  const groups = groupBySession(curPapers.value);
  for (const g of groups) {
    g.papers.sort((a, b) => (a.poster_idx ?? 99999) - (b.poster_idx ?? 99999));
  }
  return groups;
});

const curDef = computed(() => papersStore.dayDef(day.value));

function timeLabelOf(group: SessionGroup): string {
  const first = group.papers[0];
  if (!first) return "";
  return `${first.start}–${first.end} · ${group.room || ""}`;
}

function doPrint() {
  window.print();
}
</script>

<template>
  <div class="sched">
    <div class="day-tabs">
      <button
        v-for="def in dayDefs"
        :key="def.date"
        class="day-tab"
        :class="{ active: day === def.date }"
        @click="ui.setScheduleDay(def.date)"
      >
        <div class="d-name">{{ def.long }}</div>
        <div class="d-date">{{ def.pretty }}</div>
        <div class="d-count">{{ (byDay[def.date] || []).length }} saved</div>
      </button>
    </div>
    <div class="sched-body">
      <div class="print-header">
        <div class="ph-mark">My ICLR Schedule</div>
        <div class="ph-sub">
          <template v-if="curDef">
            {{ curDef.long }} · {{ curDef.pretty }} ·
          </template>
          {{ curPapers.length }} papers saved
        </div>
      </div>

      <div v-if="curPapers.length" class="sched-tools">
        <button class="btn" @click="doPrint">Print</button>
      </div>

      <template v-if="curPapers.length === 0">
        <div class="empty">
          <span class="mark">Nothing saved yet</span>
          <div style="margin-bottom: 18px">
            Browse papers and tap + to plan your
            {{ curDef?.long || "day" }}.
          </div>
          <button class="btn primary" @click="ui.setTab('explore')">
            Browse papers →
          </button>
        </div>
      </template>
      <template v-else>
        <div v-for="sess in sessions" :key="sess.session" class="sess-block">
          <div class="sess-head">
            <div>
              <div class="sess-name">{{ sess.session }}</div>
              <div class="sess-time">{{ timeLabelOf(sess) }}</div>
            </div>
            <div class="sess-counts">{{ sess.papers.length }}</div>
          </div>
          <div
            v-for="p in sess.papers"
            :key="p.id"
            class="check-row"
            @click="ui.openPaper(p.id)"
          >
            <div class="chk-pos">{{ p.poster_pos || "ORAL" }}</div>
            <div>
              <div class="chk-title">{{ p.title }}</div>
            </div>
            <div class="chk-tier" :class="tierClass(p)">
              {{ tierText(p) }}
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
