<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { usePapersStore } from "@/stores/papers";
import { useSavedStore } from "@/stores/saved";
import { sessionsWithMeta } from "@/composables/usePapers";

const papersStore = usePapersStore();
const saved = useSavedStore();
const { papers } = storeToRefs(papersStore);
const { idSet: savedIds } = storeToRefs(saved);

interface Row {
  name: string;
  total: number;
  saved: number;
}

interface Group {
  key: string;
  label: string;
  rows: Row[];
}

const groups = computed<Group[]>(() => {
  const metas = sessionsWithMeta(papers.value);
  const savedPerSession: Record<string, number> = {};
  for (const p of papers.value) {
    if (!p.session) continue;
    if (savedIds.value.has(p.id))
      savedPerSession[p.session] = (savedPerSession[p.session] || 0) + 1;
  }
  const byDay = new Map<string, Row[]>();
  const order: string[] = [];
  for (const m of metas) {
    const key = m.day || "";
    const row = {
      name: m.name,
      total: m.total,
      saved: savedPerSession[m.name] || 0,
    };
    const list = byDay.get(key);
    if (list) list.push(row);
    else {
      byDay.set(key, [row]);
      order.push(key);
    }
  }
  return order.map((key) => {
    const def = key ? papersStore.dayDef(key) : null;
    return {
      key: key || "unscheduled",
      label: def ? `${def.short} · ${def.pretty}` : "Unscheduled",
      rows: byDay.get(key)!,
    };
  });
});
</script>

<template>
  <div class="page sitemap">
    <div class="page-head">Sessions</div>
    <h1 class="sitemap-title">Sessions</h1>
    <p class="sitemap-sub">
      All sessions, grouped by day. Middle-click to open in a new tab.
    </p>
    <div v-for="g in groups" :key="g.key" class="sitemap-section">
      <h2 class="sitemap-section-title">{{ g.label }}</h2>
      <ul class="sitemap-list">
        <li v-for="r in g.rows" :key="r.name">
          <router-link
            class="sitemap-link"
            :to="{ path: '/', query: { session: r.name } }"
          >
            <span class="sitemap-name">{{ r.name }}</span>
            <span class="sitemap-count">{{ r.saved }}/{{ r.total }}</span>
          </router-link>
        </li>
      </ul>
    </div>
  </div>
</template>
