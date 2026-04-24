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
  (opinionated recommender — see "Recommender" below; falls back to
  rating when nothing is saved), `similar` (cosine to a seed paper —
  implicit from the `seed` URL param), `rating`, `time`, `poster_id`.
  Filter drawer supports day, session, event type, saved-only,
  topic cluster, institution.
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

## Recommender

The "reco" sort in `src/composables/useSimilarity.ts` is a three-stage
pipeline (strategy name: `"opinionated"`, toggleable via
`RANKING_STRATEGY`). Runs entirely in the browser on the saved set.
Fully deterministic — no jitter, so repeat runs on the same saved set
produce identical orderings.

1. **Cluster-LSE relevance.** Saved papers are leader-clustered
   (`clusterByLeader`, cosine threshold 0.7). For each candidate we
   compute
   `score = τ · log Σ_c exp((cos(v, c̄) · log(1+|c|)) / τ)`
   over non-singleton clusters, with `τ = 0.3` (OPINIONATED_TAU). τ→0
   recovers hard max (blocky); τ→∞ approaches average. Size weight
   keeps larger clusters in charge without silencing smaller ones.
2. **Quality prior.** `γ · qualityPrior(rating)` where
   `qualityPrior = clip((rating − 5) / 2, 0, 1)`, γ=0.8
   (OPINIONATED_RATING_WEIGHT). Missing rating → 0.3.
3. **MMR diversification.** `mmrRerank` picks 120 items from the top
   250 by `λ · rel − (1−λ) · max cos-to-picked`, λ=0.75
   (OPINIONATED_LAMBDA / POOL / PICK). The tail is relevance-sorted.

Rebuild is pinned to saved-set and embeddings changes (not
filter/query/sort) via `watch(savedIds, snapshotRanking, { deep })`.
The pre-computed `rankOrder: Map<paperId, number>` is reused by every
subsequent filter/query recompute, so scrolling and typing are free.
A `RECO_DEBUG=1`-gated harness at `src/composables/reco.debug.test.ts`
benchmarks strategies against a fixed 40-save fixture (diversity,
mean rating, blocking simulation).

## Topic page freeze

`TopicsPage` ranks topics by the "clusters" strategy against a frozen
snapshot of saved IDs (localStorage key `cn_saved_snapshot`) so the
list doesn't reshuffle under the user as they keep saving. The
snapshot is seeded the first time `savedIds.size >= FREEZE_MIN_SAVED`
(10); below that threshold the ranking tracks the live saved set.
Once seeded, drift between snapshot and live saved is shown as a
"Refresh ranking" banner that re-seeds on click. Correctness of the
freeze relies on the ranking being deterministic given the snapshot
IDs — don't reintroduce jitter into the clusters/opinionated
strategies without first snapshotting the output order instead.

Other sort modes are trivial sorts in `Explore.vue`. `FilterDrawer`
explicitly uses strategy `"centroid"` to order the cluster filter
chips (stable, not re-ordered per visit).

## URL schema

- `/` — Explore. Query params are the single source of truth for
  filters, sort, search, and seed paper: `q`, `sort`, `seed`, repeat
  keys `day=2026-04-24&day=2026-04-25`, `event`, `cluster`, `inst`,
  `session`, plus flags `spotlight=1`, `saved=1`.
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
- `presentation.start_time` / `end_time` are ISO-8601 strings **with a
  timezone offset** (e.g. `"2026-04-24T09:00:00-03:00"`). `adaptPaper`
  parses them into `Date` objects on `Paper.start` / `Paper.end`; display
  goes through `formatTime` in `composables/usePapers.ts`, which renders
  in the conference timezone (`CONFERENCE_TZ = "America/Sao_Paulo"`) so
  users see venue-local time regardless of their own locale. If the
  offset is ever dropped upstream, parsing silently reinterprets as the
  user's local time — see the matching contract in
  `preprocessor/CLAUDE.md`.
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
