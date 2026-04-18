# Frontend styleguide

How we write the Vue + TypeScript code in this project. Covers JS/TS
logic only — build config lives in `vite.config.ts`, lint rules in
`eslint.config.js`.

## Components

**Single-file components** (`.vue`) with `<script setup lang="ts">` and
Composition API. One component per file, PascalCase filenames in
`src/components/`.

```vue
<script setup lang="ts">
import { computed } from "vue";
import { useUiStore } from "@/stores/ui";

const props = defineProps<{ label: string }>();
const ui = useUiStore();
const tab = computed(() => ui.tab);
</script>

<template>
  <button @click="ui.setTab('explore')">{{ props.label }}</button>
</template>
```

- Declare props with the type-only `defineProps<{…}>()` form.
- Read store state via `storeToRefs(store)` when you need reactive
  refs in the template; call actions directly on the store instance
  (`ui.setTab(…)`).
- No `.vue` template type-check surprises: `vue-tsc` runs in
  `npm run typecheck` and on every `npm run build`.

## State — Pinia

Stores live in `src/stores/`, one file per concern. Use the
setup-style `defineStore` so refs are typed naturally.

```ts
// src/stores/example.ts
import { defineStore } from "pinia";
import { ref } from "vue";

export const useExampleStore = defineStore("example", () => {
  const count = ref(0);
  function inc() {
    count.value++;
  }
  return { count, inc };
});
```

Current split:

- `papers` — load-once data (papers array, embeddings map, load state).
- `saved` — the user's saved paper IDs.
- `ui` — ephemeral UI state (active tab, filters, sort, open sheets,
  etc.).

## Persistence — VueUse

Browser persistence goes through `useLocalStorage` from
`@vueuse/core`. No manual `JSON.parse` / `watch` / `setItem`.

```ts
import { useLocalStorage } from "@vueuse/core";

export const useSavedStore = defineStore("saved", () => {
  const savedIds = useLocalStorage<string[]>("cn_saved", []);
  // …
  return { savedIds };
});
```

The composable serialises on write and hydrates on read; the ref is
reactive everywhere it's used.

## Composables

Pure logic that isn't tied to a single store goes in
`src/composables/`. Keep them framework-light — most should be plain
typed functions that happen to be imported from `.vue` files.

- `useSimilarity.ts` — `cosine`, `centroid`, `savedCentroid`,
  `topKSimilar`.
- `usePapers.ts` — `dedupeByUid`, `groupBySession`, `tierText`,
  date/label helpers.

## Types

All shared types live in `src/types.ts`. In particular `RawPaper` (the
shape loaded from `data/rated-papers.json`) and `Paper` (the adapted
shape used everywhere in the app) are a single source of truth — import
from `@/types`, don't redefine.

## Build & lint

- Vite + `@vitejs/plugin-vue`.
- `vue-tsc --noEmit` for type-checking (runs before every build).
- ESLint flat config with `eslint-plugin-vue` + `@vue/eslint-config-typescript`.
- Prettier via `@vue/eslint-config-prettier`; run `npm run format` to
  normalise.
- `npm run build` emits a hashed, self-sufficient bundle to `dist/`.
