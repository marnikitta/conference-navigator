# Claude notes

Vue 3 + TypeScript SPA for navigating ICLR 2026 papers. No backend.
Reads two static JSON files from `data/` at runtime. Styleguide in
`docs/frontend.md` — read it before touching code.

## Stack

- Vue 3 single-file components, `<script setup lang="ts">`, Composition API
- Vite for build and dev server (`@vitejs/plugin-vue`)
- Pinia for state, split by concern
- VueUse `useLocalStorage` for persistence
- ESLint + Prettier; `vue-tsc` for type-checking (runs on every build)
- Output: `dist/` — a self-sufficient static bundle with relative asset
  paths; any dumb static host (including `python3 -m http.server`)
  serves it.

## Layout

```
index.html            Vite entry at repo root
vite.config.ts        base: "./" + @ alias → src/
eslint.config.js, .prettierrc.json
tsconfig.json (+ app / node)
src/
  main.ts             createApp + Pinia + mount + papers.load()
  App.vue             shell: topbar, tabs, <Explore>|<Schedule>, sheets
  style.css           vanilla CSS (design tokens on :root)
  env.d.ts            vite/client + *.vue shim for the IDE
  types.ts            RawPaper, Paper, Tab, Sort, Filters, SessionGroup
  stores/
    papers.ts         data: papers[], embeddings Map, loaded/loadError, load()
    saved.ts          savedIds backed by useLocalStorage("cn_saved")
    ui.ts             ephemeral: tab, filters, sort, seed, drawer/export state
  composables/
    useSimilarity.ts  cosine, centroid, savedCentroid, topKSimilar
    usePapers.ts      dedupeByUid, groupBySession, tierText/Class, day helpers
  components/
    Topbar.vue  Tabs.vue  Explore.vue  Schedule.vue
    PaperRow.vue  FilterDrawer.vue  DetailSheet.vue  ExportSheet.vue
  assets/fonts/       Figtree woff2 (referenced from style.css; Vite hashes)
public/
  data/               rated-papers.json, embeddings.json (copied verbatim to dist/)
docs/frontend.md      styleguide
dist/                 build output (gitignored)
```

## App shape

Two tabs:

- **Explore** — filterable, searchable list of all papers. Sort modes:
  `reco` (cosine to the centroid of saved papers; falls back to rating
  when nothing is saved), `similar` (cosine to a seed paper),
  `rating`, `time`, `poster_id`, `spotlight`. Filter drawer supports
  day, session, event type, min rating, saved-only, topic cluster,
  institution.
- **My schedule** — the user's saved papers for the active day (Thu /
  Fri / Sat), grouped by session, ordered by poster position. Print
  button emits a print-friendly view.

A **DetailSheet** overlays either tab when a paper is opened. It shows
metadata, save toggle, abstract, links, and a "Similar papers" strip
(top 5 by cosine to the current paper's embedding). There is **no
"For You" tab and no 2D/UMAP map view** — recommendation/k-NN logic
powers sort modes and the similar-papers strip only.

An **ExportSheet** lets the user copy their saved ID list to the
clipboard or paste a replacement list back in.

**Only persistent state** is the saved ID array in `localStorage` under
the key `cn_saved` (handled by VueUse). Everything else is derived
from the static data on each load.

## Data contract

Two static JSON files under `public/data/` (copied verbatim to
`dist/data/` on build; the app fetches `data/rated-papers.json` and
`data/embeddings.json` relative to `index.html`).

- `rated-papers.json` — array of `RawPaper`. Each record carries:
  `id`, `title`, `abstract`, `authors` (with decoded HTML entities),
  `event_type`, `tier` (always present: `"Oral" | "Spotlight" |
  "Poster"`), `presentation` (session, room, `poster_position`,
  `poster_position_idx`, start/end ISO times), `materials`
  (openreview/code/slides/poster/virtual URLs; `virtual_url` is always
  absolute), `metadata` (`coords`, `topic_id`, `topic` — clustered
  topic name, `null` for HDBSCAN noise), and `openreview`
  (`avg_rating`, `avg_confidence`, `ratings: number[]`, nullable).
- `embeddings.json` — `{paper_id: number[]}`; 128-dim vectors,
  re-normalized on load.

Invariants:

- `metadata.coords` is in roughly `[-1, 1]` with aspect preserved.
  **Currently unused by the app** — present in the data but not
  rendered anywhere. Don't assume a visualization exists; adding one
  is net-new work.
- `metadata.topic_id === -1` means HDBSCAN noise; the pipeline emits
  `metadata.topic = null` in that case. Frontend renders it as "no
  topic", and filter chips hide the bucket.
- `openreview` is `null` for Journal Track / papers without an
  OpenReview URL; `tier` is still present because the pipeline falls
  back to the raw `decision` string.
- `presentation.poster_position` is the raw string (e.g.
  `"P3-#1224"`); `poster_position_idx` is the trailing int.
- Oral papers appear **twice** in `rated-papers.json` — once as the
  Oral event (usually on an earlier day), once as the Poster sibling
  with the same title but different `id`. This is intentional: both
  belong on the walking-the-hall schedule. There is no frontend
  dedup; saving one doesn't save the other.
- HTML entities in `title`, `abstract`, and author fields are decoded
  by the pipeline — don't re-decode in the frontend.

## Dev

- `npm install` — once.
- `npm run dev` — Vite dev server with HMR.
- `npm run build` — `vue-tsc` + Vite production build → `dist/`.
- `npm run preview` — Vite serves the built bundle.
- `npm run lint` / `npm run lint:fix` / `npm run format` / `npm run typecheck`.
- `dist/` is fully self-sufficient: `cd dist && python3 -m http.server`
  (or upload to any static host) just works.
