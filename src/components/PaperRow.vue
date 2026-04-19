<script setup lang="ts">
import { computed } from "vue";
import { usePapersStore } from "@/stores/papers";
import { useSavedStore } from "@/stores/saved";
import { tierText, tierClass } from "@/composables/usePapers";
import type { Paper } from "@/types";

const props = defineProps<{ paper: Paper }>();

const papersStore = usePapersStore();
const saved = useSavedStore();

const dayShort = computed(
  () => papersStore.dayDef(props.paper.day)?.short || "",
);

const isSaved = computed(() => saved.has(props.paper.id));
const tierLabel = computed(() => tierText(props.paper));
const tierCls = computed(() => tierClass(props.paper));
const rowClass = computed(() => "paper-row" + (isSaved.value ? " saved" : ""));
const highRating = computed(
  () => props.paper.rating != null && props.paper.rating >= 7.5,
);

const authorLine = computed(() => {
  const p = props.paper;
  if (!p.authors.length) return "";
  const insts = Array.from(
    new Set(p.authors.map((a) => a.inst).filter(Boolean)),
  );
  const first = p.authors[0]?.name || "";
  const rest = p.authors.length - 1;
  const who = rest > 0 ? `${first} +${rest}` : first;
  const instsShown =
    insts.slice(0, 2).join(", ") +
    (insts.length > 2 ? ` +${insts.length - 2}` : "");
  return instsShown ? `${who} · ${instsShown}` : who;
});

const locationLabel = computed(
  () => props.paper.poster_pos || props.paper.room || "",
);

function toggle() {
  saved.toggle(props.paper.id);
}
</script>

<template>
  <div :class="rowClass">
    <router-link
      class="paper-row-link"
      :to="`/paper/${paper.id}`"
      :aria-label="paper.title"
    />
    <div class="main">
      <div class="title">{{ paper.title }}</div>
      <div class="meta-line">
        <template v-if="paper.rating != null">
          <span class="rating-inline" :class="{ high: highRating }">
            {{ paper.rating.toFixed(1) }}
          </span>
          <span class="dot">·</span>
        </template>
        <span class="tier" :class="tierCls">{{ tierLabel }}</span>
        <span class="dot">·</span>
        <span v-if="paper.day">{{ dayShort }} {{ paper.start }}</span>
        <template v-if="locationLabel">
          <span class="dot">·</span>
          <span :class="{ 'poster-pos': !!paper.poster_pos }">
            {{ locationLabel }}
          </span>
        </template>
        <template v-if="paper.topic_cluster">
          <span class="dot">·</span>
          <span>{{ paper.topic_cluster }}</span>
        </template>
      </div>
      <div class="authors">{{ authorLine }}</div>
    </div>
    <div class="right">
      <button
        class="save"
        :title="isSaved ? 'Remove from schedule' : 'Save to schedule'"
        @click="toggle"
      >
        {{ isSaved ? "♥" : "+" }}
      </button>
    </div>
  </div>
</template>
