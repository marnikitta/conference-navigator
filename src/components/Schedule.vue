<script setup lang="ts">
import { computed, watchEffect } from "vue";

defineOptions({ name: "Schedule" });
import { storeToRefs } from "pinia";
import { exploreUrl, useUiStore } from "@/stores/ui";
import { usePapersStore } from "@/stores/papers";
import { useSavedStore } from "@/stores/saved";
import {
  groupBySession,
  tierText,
  tierClass,
  formatTime,
} from "@/composables/usePapers";
import { useNow, isLive } from "@/composables/useNow";
import type { Day, Paper, SessionGroup } from "@/types";

const ui = useUiStore();
const papersStore = usePapersStore();
const saved = useSavedStore();
const now = useNow();
const { scheduleDay: day } = storeToRefs(ui);
const { papers, dayDefs } = storeToRefs(papersStore);
const { idSet: savedIds } = storeToRefs(saved);

// Default the active day to today if the conference is in session, else the first day.
watchEffect(() => {
  if (!day.value && dayDefs.value.length) {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const match = dayDefs.value.find((d) => d.date === today);
    ui.setScheduleDay(match?.date ?? dayDefs.value[0].date);
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

function sessionsFor(list: Paper[]): SessionGroup[] {
  const groups = groupBySession(list);
  for (const g of groups) {
    g.papers.sort((a, b) => (a.poster_idx ?? 99999) - (b.poster_idx ?? 99999));
  }
  return groups;
}

const sessions = computed<SessionGroup[]>(() => sessionsFor(curPapers.value));

const printDays = computed(() =>
  dayDefs.value
    .map((def) => ({ def, sessions: sessionsFor(byDay.value[def.date] || []) }))
    .filter((d) => d.sessions.length > 0),
);

const curDef = computed(() => papersStore.dayDef(day.value));

function timeLabelOf(group: SessionGroup): string {
  const first = group.papers[0];
  if (!first) return "";
  return `${formatTime(first.start)}–${formatTime(first.end)} · ${group.room || ""}`;
}

function liveNow(group: SessionGroup): boolean {
  return isLive(group.start, group.end, now.value);
}

function doPrint() {
  window.print();
}

function sessionHref(sess: SessionGroup) {
  return exploreUrl({
    sessions: [sess.session],
    ...(sess.day ? { days: [sess.day] } : {}),
  });
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
        <div class="ph-sub">{{ savedPapers.length }} papers saved</div>
      </div>

      <div v-if="savedPapers.length" class="sched-tools">
        <button class="btn" @click="doPrint">Print all days</button>
      </div>

      <template v-if="curPapers.length === 0">
        <div class="empty screen-only">
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
        <div class="screen-only">
          <div v-for="sess in sessions" :key="sess.session" class="sess-block">
            <div class="sess-head">
              <div>
                <router-link
                  class="sess-name sess-name-link"
                  :to="sessionHref(sess)"
                >
                  <span
                    v-if="liveNow(sess)"
                    class="live-dot"
                    :title="'Happening now'"
                    aria-label="Happening now"
                  />
                  {{ sess.session }}
                </router-link>
                <div class="sess-time">{{ timeLabelOf(sess) }}</div>
              </div>
              <div class="sess-counts">{{ sess.papers.length }}</div>
            </div>
            <router-link
              v-for="p in sess.papers"
              :key="p.id"
              class="check-row"
              :to="`/paper/${p.id}`"
            >
              <div class="chk-pos">{{ p.poster_pos || "ORAL" }}</div>
              <div>
                <div class="chk-title">{{ p.title }}</div>
              </div>
              <div class="chk-tier" :class="tierClass(p)">
                {{ tierText(p) }}
              </div>
            </router-link>
          </div>
        </div>
      </template>

      <div class="print-all">
        <div v-for="d in printDays" :key="d.def.date" class="print-day">
          <div class="print-day-head">
            {{ d.def.long }} · {{ d.def.pretty }}
          </div>
          <div
            v-for="sess in d.sessions"
            :key="sess.session"
            class="sess-block"
          >
            <div class="sess-head">
              <div>
                <div class="sess-name">{{ sess.session }}</div>
                <div class="sess-time">{{ timeLabelOf(sess) }}</div>
              </div>
              <div class="sess-counts">{{ sess.papers.length }}</div>
            </div>
            <div v-for="p in sess.papers" :key="p.id" class="check-row">
              <div class="chk-pos">{{ p.poster_pos || "ORAL" }}</div>
              <div>
                <div class="chk-title">{{ p.title }}</div>
              </div>
              <div class="chk-tier" :class="tierClass(p)">
                {{ tierText(p) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
