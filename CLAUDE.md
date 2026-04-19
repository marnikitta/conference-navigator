# Claude notes

Vue 3 + TypeScript SPA for navigating ICLR 2026 papers. No backend.
Reads two static JSON files from `data/` at runtime. Styleguide in
`docs/frontend.md` — read it before touching code.

## Stack

- Vue 3 single-file components, `<script setup lang="ts">`, Composition API
- Vite for build and dev server (`@vitejs/plugin-vue`)
- Vue Router 4 in **history mode** (`createWebHistory`) — the URL is the
  source of truth for tab, filters, sort, search, seed paper, and which
  paper/export overlay is open. Deploying needs the host to rewrite
  unknown paths to `index.html` (nginx `try_files`, already configured).
  `python3 -m http.server` will serve `/` but 404 on refresh of deep
  routes.
- Pinia for state, split by concern
- VueUse `useLocalStorage` for persistence
- ESLint + Prettier; `vue-tsc` for type-checking (runs on every build)
- Output: `dist/` — static bundle with **absolute** asset paths
  (`base: "/"`), served from the root of the host.

## Layout

```
index.html            Vite entry at repo root
vite.config.ts        base: "/" + @ alias → src/
eslint.config.js, .prettierrc.json
tsconfig.json (+ app / node)
src/
  main.ts             createApp + Pinia + Router + mount + papers.load()
  router.ts           routes: /, /schedule, /paper/:id, /export (+ catch-all)
  App.vue             shell: topbar, tabs, <router-view>
  style.css           vanilla CSS (design tokens on :root)
  env.d.ts            vite/client + *.vue shim for the IDE
  types.ts            RawPaper, Paper, Tab, Sort, Filters, SessionGroup, DayDef
  stores/
    papers.ts         papers[], embeddings Map, dayDefs (inferred from
                       data), dayDef(date), loaded/loadError, load()
    saved.ts          savedIds backed by useLocalStorage("cn_saved")
    ui.ts             URL-backed computed: tab, filters, sort, seed, q.
                       Ephemeral refs: scheduleDay, filterDrawerOpen.
                       Filter ⇄ query mapping lives in one FILTER_CODECS
                       table.
  composables/
    useSimilarity.ts  cosine, centroid, savedCentroid, topKSimilar
    usePapers.ts      groupBySession, tierText/Class, unique helpers
  components/
    Topbar.vue  Tabs.vue  Explore.vue  Schedule.vue
    PaperRow.vue  FilterDrawer.vue  PaperPage.vue  ExportPage.vue
  assets/fonts/       Figtree woff2 (referenced from style.css; Vite hashes)
public/
  data/               papers.json, embeddings.json (copied verbatim to dist/)
docs/frontend.md      styleguide
dist/                 build output (gitignored)
```

## App shape

Four routes, each its own page (no overlays):

- **`/` — Explore**: filterable, searchable list. Sort modes: `reco`
  (cosine to the centroid of saved papers; falls back to rating when
  nothing is saved), `similar` (cosine to a seed paper — implicit from
  the `seed` URL param), `rating`, `time`, `poster_id`, `spotlight`.
  Filter drawer supports day, session, event type, min rating,
  saved-only, topic cluster, institution.
- **`/schedule` — My schedule**: saved papers for the active day,
  grouped by session, ordered by poster position. Day sub-tabs
  (inferred from the data, see below) are in-memory only — not in the
  URL. Print button emits a print-friendly view.
- **`/paper/:id` — Paper page**: full page with metadata, save toggle,
  abstract, links, and a "Similar papers" strip (top 5 by cosine to
  the current paper's embedding). Every click pushes a history entry,
  so browser back (or iOS edge-swipe) returns to the prior page.
  Invalid id → "Paper not found" state.
- **`/export` — Export / import**: copy the saved ID list to the
  clipboard or paste a replacement list back in.

There is **no "For You" tab and no 2D/UMAP map view** —
recommendation/k-NN logic powers sort modes and the similar-papers
strip only.

## URL schema

- `/` — Explore. Query params are the single source of truth for
  filters, sort, search, and seed paper: `q`, `sort`, `seed`, repeat
  keys `day=2026-04-24&day=2026-04-25`, `event`, `cluster`, `inst`,
  `session`, plus flags `spotlight=1`, `saved=1`, `minRating=7.5`.
  Writes are `router.replace` so filter tweaking doesn't pollute
  history. `sort=similar` is **never emitted** — the presence of
  `seed` implies it.
- `/schedule` — Schedule. The Thu/Fri/Sat sub-tabs live in
  `ui.scheduleDay` (ephemeral ref), not the URL.
- `/paper/:id` — paper page. Push, not replace, so browser back returns
  to the prior page. No query params needed.
- `/export` — export/import page.
- Unknown paths redirect to `/`.

**Only persistent state** is the saved ID array in `localStorage` under
the key `cn_saved` (handled by VueUse). Everything else is derived
from the URL + static data on each load.

## Data contract

Two static JSON files under `public/data/` (copied verbatim to
`dist/data/` on build; the app fetches
`${import.meta.env.BASE_URL}data/papers.json` and
`…data/embeddings.json` — absolute so history-mode deep routes don't
mis-resolve the relative path). The preprocessor writes
`clustered-papers.json` on its side and the Makefile's `precompute`
target copies it here as `papers.json`.

- `papers.json` — array of `RawPaper`. Each record carries:
  `id`, `title`, `abstract`, `authors` (with decoded HTML entities),
  `event_type`, `tier` (always present: `"Oral" | "Spotlight" |
"Poster"`), `presentation` (session, room, `poster_position`,
  start/end ISO times — no pre-parsed int, `adaptPaper` pulls the
  trailing digits off `poster_position`), `materials`
  (openreview/code/slides/poster/virtual URLs; `virtual_url` is always
  absolute), `metadata` (`topic_id`, `topic` — clustered topic name),
  and `openreview` (`tldr: string | null`, `keywords: string[]`,
  `ratings: number[]`, nullable — the pipeline also ships other
  per-reviewer score arrays that we ignore).
- `embeddings.json` — `{paper_id: number[]}`; 128-dim vectors,
  re-normalized on load.

Invariants:

- `metadata.topic` is always a named cluster (HDBSCAN noise points are
  reassigned to their nearest cluster — no null/Unclassified bucket).
- `openreview` is `null` for Journal Track / papers without an
  OpenReview URL; `tier` sits on the paper (not under `openreview`)
  and is always populated.
- `openreview.avg_rating` / `avg_confidence` no longer ship. The mean
  is computed from `openreview.ratings` in `adaptPaper` and exposed as
  `Paper.rating`.
- `presentation.poster_position` is the raw string (e.g. `"P3-#1224"`);
  `Paper.poster_idx` is parsed from its trailing digits by
  `adaptPaper`.
- Oral papers appear **twice** in `papers.json` — once as the
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
- `dist/` deploys to any static host that rewrites unknown paths to
  `index.html` (nginx `try_files $uri /index.html;`). A plain
  `python3 -m http.server` serves `/` but returns 404 on refreshes of
  `/paper/:id` etc. — that's the cost of history mode.
