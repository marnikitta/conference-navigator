<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { storeToRefs } from "pinia";
import { exploreUrl, useUiStore } from "@/stores/ui";
import { usePapersStore } from "@/stores/papers";
import { useSavedStore } from "@/stores/saved";
import { topKSimilar, type SimilarHit } from "@/composables/useSimilarity";
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

const similar = computed<SimilarHit[]>(() => {
  const p = paper.value;
  if (!p) return [];
  const seed = papersStore.vecFor(p);
  if (!seed) return [];
  return topKSimilar(papers.value, seed, (x) => papersStore.vecFor(x), 5, p.id);
});

function toggle() {
  if (paper.value) saved.toggle(paper.value.id);
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
        <router-link
          v-if="a.inst"
          class="a-inst a-inst-link"
          title="Filter by this institution"
          :to="exploreUrl({ insts: [a.inst] })"
        >
          {{ a.inst }}
        </router-link>
        <template v-if="i < paper.authors.length - 1"> · </template>
      </span>
    </div>

    <div class="det-kv">
      <div v-if="whenLabel && paper.day" class="kv">
        <div class="k">When</div>
        <router-link
          class="v v-link"
          title="Open in Explore"
          :to="exploreUrl({ days: [paper.day] })"
        >
          {{ whenLabel }}
        </router-link>
      </div>
      <div v-if="whereLabel" class="kv">
        <div class="k">Where</div>
        <router-link
          v-if="paper.session"
          class="v v-link"
          title="Open in Explore"
          :to="exploreUrl({ sessions: [paper.session] })"
        >
          {{ whereLabel }}
        </router-link>
        <div v-else class="v">{{ whereLabel }}</div>
      </div>
      <div v-if="paper.session" class="kv">
        <div class="k">Session</div>
        <router-link
          class="v v-link"
          title="Open in Explore"
          :to="exploreUrl({ sessions: [paper.session] })"
        >
          {{ paper.session }}
        </router-link>
      </div>
      <div v-if="paper.topic_cluster" class="kv">
        <div class="k">Topic</div>
        <router-link
          class="v v-link"
          title="Open in Explore"
          :to="exploreUrl({ clusters: [paper.topic_cluster] })"
        >
          {{ paper.topic_cluster }}
        </router-link>
      </div>
      <div v-if="paper.rating != null" class="kv">
        <div class="k">Review rating</div>
        <a
          v-if="paper.openreview_url"
          :href="paper.openreview_url"
          target="_blank"
          rel="noopener"
          class="v review-link"
          :class="{ accent: highRating }"
        >
          {{ paper.rating.toFixed(2)
          }}<template v-if="paper.ratings && paper.ratings.length">
            · reviews {{ paper.ratings.join(", ") }}
          </template>
          <span class="arrow">↗</span>
        </a>
        <div v-else class="v" :class="{ accent: highRating }">
          {{ paper.rating.toFixed(2)
          }}<template v-if="paper.ratings && paper.ratings.length">
            · reviews {{ paper.ratings.join(", ") }}
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

    <div v-if="paper.tldr" class="det-tldr">{{ paper.tldr }}</div>

    <div v-if="paper.keywords.length" class="det-keywords">
      <span v-for="kw in paper.keywords" :key="kw" class="kw">{{ kw }}</span>
    </div>

    <template v-if="paper.summary_long">
      <div class="det-section-title">Summary</div>
      <div class="det-summary">{{ paper.summary_long }}</div>
    </template>

    <template v-if="paper.abstract">
      <div class="det-section-title">Abstract</div>
      <div class="det-abstract">{{ paper.abstract }}</div>
    </template>

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
      <router-link
        v-for="hit in similar"
        :key="hit.paper.id"
        class="sim-row"
        :to="`/paper/${hit.paper.id}`"
      >
        <div>
          <div class="sim-title">{{ hit.paper.title }}</div>
          <div class="sim-meta">
            {{ tierText(hit.paper) }}
            <template v-if="hit.paper.day">
              ·
              {{ papersStore.dayDef(hit.paper.day)?.short || hit.paper.day }}
              {{ hit.paper.start }}
            </template>
            <template v-if="hit.paper.poster_pos || hit.paper.room">
              · {{ hit.paper.poster_pos || hit.paper.room }}
            </template>
          </div>
        </div>
        <div class="sim-score">{{ hit.score.toFixed(2) }}</div>
      </router-link>
      <router-link
        class="btn det-explore"
        :to="{ path: '/', query: { seed: paper.id } }"
      >
        → Show all similar papers
      </router-link>
    </template>
  </div>
</template>
