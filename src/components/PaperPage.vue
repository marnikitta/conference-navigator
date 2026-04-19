<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { storeToRefs } from "pinia";
import { useUiStore } from "@/stores/ui";
import { usePapersStore } from "@/stores/papers";
import { useSavedStore } from "@/stores/saved";
import { topKSimilar } from "@/composables/useSimilarity";
import { tierText } from "@/composables/usePapers";
import type { Paper } from "@/types";

const route = useRoute();
const ui = useUiStore();
const papersStore = usePapersStore();
const saved = useSavedStore();
const { papers } = storeToRefs(papersStore);

const paperId = computed(() => {
  const v = route.params.id;
  return typeof v === "string" ? v : "";
});

const paper = computed<Paper | null>(
  () => papers.value.find((p) => p.id === paperId.value) || null,
);

const isSaved = computed(() =>
  paper.value ? saved.has(paper.value.id) : false,
);

const tierLabel = computed(() => (paper.value ? tierText(paper.value) : ""));

const whenLabel = computed(() => {
  const p = paper.value;
  if (!p || !p.day) return "";
  const long = papersStore.dayDef(p.day)?.long || p.day;
  return `${long} · ${p.start}–${p.end}`;
});

const whereLabel = computed(() => {
  const p = paper.value;
  if (!p) return "";
  return p.poster_pos ? `${p.room} · ${p.poster_pos}` : p.room;
});

const highRating = computed(
  () => paper.value?.rating != null && paper.value.rating >= 7.5,
);

interface SimilarRow extends Paper {
  _score: number;
}

const similar = computed<SimilarRow[]>(() => {
  const p = paper.value;
  if (!p) return [];
  const seed = papersStore.vecFor(p);
  if (!seed) return [];
  const top = topKSimilar(
    papers.value,
    seed,
    (x) => papersStore.vecFor(x),
    5,
    p.id,
  );
  return top.map((t) => ({ ...t.paper, _score: t.score }));
});

function toggle() {
  if (paper.value) saved.toggle(paper.value.id);
}

function openSim(id: string) {
  ui.openPaper(id);
}

function showAllSimilar() {
  if (paper.value) ui.showAllSimilar(paper.value.id);
}

function filterDay() {
  if (paper.value?.day) ui.applyExploreFilter({ days: [paper.value.day] });
}

function filterSession() {
  if (paper.value?.session)
    ui.applyExploreFilter({ sessions: [paper.value.session] });
}

function filterCluster() {
  if (paper.value?.topic_cluster)
    ui.applyExploreFilter({ clusters: [paper.value.topic_cluster] });
}

function filterInst(inst: string) {
  if (inst) ui.applyExploreFilter({ insts: [inst] });
}
</script>

<template>
  <div v-if="!paper" class="page empty">
    <span class="mark">Paper not found</span>
    <div>
      The id <code>{{ paperId }}</code> isn't in this year's data.
    </div>
    <button class="btn primary" @click="ui.setTab('explore')">
      Back to Explore →
    </button>
  </div>
  <div v-else class="page">
    <div class="page-head">{{ tierLabel }}</div>
    <div class="det-title">{{ paper.title }}</div>
    <div class="det-authors">
      <span v-for="(a, i) in paper.authors" :key="i">
        {{ a.name }}
        <button
          v-if="a.inst"
          class="a-inst a-inst-link"
          title="Filter by this institution"
          @click="filterInst(a.inst)"
        >
          {{ a.inst }}
        </button>
        <template v-if="i < paper.authors.length - 1"> · </template>
      </span>
    </div>

    <div class="det-kv">
      <div v-if="whenLabel" class="kv">
        <div class="k">When</div>
        <button class="v v-link" title="Open in Explore" @click="filterDay">
          {{ whenLabel }}
        </button>
      </div>
      <div v-if="whereLabel" class="kv">
        <div class="k">Where</div>
        <button
          v-if="paper.session"
          class="v v-link"
          title="Open in Explore"
          @click="filterSession"
        >
          {{ whereLabel }}
        </button>
        <div v-else class="v">{{ whereLabel }}</div>
      </div>
      <div v-if="paper.session" class="kv">
        <div class="k">Session</div>
        <button class="v v-link" title="Open in Explore" @click="filterSession">
          {{ paper.session }}
        </button>
      </div>
      <div v-if="paper.topic_cluster" class="kv">
        <div class="k">Topic</div>
        <button class="v v-link" title="Open in Explore" @click="filterCluster">
          {{ paper.topic_cluster }}
        </button>
      </div>
      <div v-if="paper.rating != null" class="kv">
        <div class="k">Review rating</div>
        <div class="v" :class="{ accent: highRating }">
          {{ paper.rating.toFixed(2) }}
          <template v-if="paper.ratings && paper.ratings.length">
            · reviews
            <template v-for="(r, i) in paper.ratings" :key="i">
              <a
                v-if="paper.openreview_url"
                :href="paper.openreview_url"
                target="_blank"
                rel="noopener"
                class="review-link"
                >{{ r }}<span class="arrow">↗</span></a
              >
              <span v-else>{{ r }}</span>
              <template v-if="i < paper.ratings.length - 1">, </template>
            </template>
          </template>
        </div>
      </div>
    </div>

    <div class="det-primary">
      <button
        class="btn"
        :class="isSaved ? 'accent' : 'primary'"
        style="flex: 1; justify-content: center"
        @click="toggle"
      >
        {{ isSaved ? "♥ Saved — tap to remove" : "+ Save to schedule" }}
      </button>
    </div>

    <div v-if="paper.abstract" class="det-abstract">
      {{ paper.abstract }}
    </div>

    <div class="det-links">
      <a
        v-if="paper.openreview_url"
        :href="paper.openreview_url"
        target="_blank"
        rel="noopener"
        class="btn ghost"
      >
        OpenReview<span class="arrow">↗</span>
      </a>
      <a
        v-if="paper.virtual_url"
        :href="paper.virtual_url"
        target="_blank"
        rel="noopener"
        class="btn ghost"
      >
        Virtual page<span class="arrow">↗</span>
      </a>
      <a
        v-if="paper.code_url"
        :href="paper.code_url"
        target="_blank"
        rel="noopener"
        class="btn ghost"
      >
        Code<span class="arrow">↗</span>
      </a>
      <a
        v-if="paper.slides_url"
        :href="paper.slides_url"
        target="_blank"
        rel="noopener"
        class="btn ghost"
      >
        Slides<span class="arrow">↗</span>
      </a>
      <a
        v-if="paper.poster_image_url"
        :href="paper.poster_image_url"
        target="_blank"
        rel="noopener"
        class="btn ghost"
      >
        Poster<span class="arrow">↗</span>
      </a>
    </div>

    <template v-if="similar.length">
      <div class="det-section-title">Similar papers</div>
      <div
        v-for="s in similar"
        :key="s.id"
        class="sim-row"
        @click="openSim(s.id)"
      >
        <div>
          <div class="sim-title">{{ s.title }}</div>
          <div class="sim-meta">
            {{ tierText(s) }}
            <template v-if="s.day">
              ·
              {{ papersStore.dayDef(s.day)?.short || s.day }}
              {{ s.start }}
            </template>
            <template v-if="s.poster_pos || s.room">
              · {{ s.poster_pos || s.room }}
            </template>
          </div>
        </div>
        <div class="sim-score">{{ s._score.toFixed(2) }}</div>
      </div>
      <button class="btn det-explore" @click="showAllSimilar">
        → Show all similar papers
      </button>
    </template>
  </div>
</template>
