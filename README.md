# Conference Navigator — ICLR 2026

A small static web app for exploring and planning a route through ICLR
2026 posters. No backend. Build it, upload the `dist/` folder to any
static host, and you're done.

Two tabs:

- **Explore** — a filterable, searchable list of every paper. Sort by
  recommendation (see below), similarity to a seed paper, rating,
  schedule time, or poster ID.
- **My schedule** — your saved papers grouped by session and ordered
  by poster number, so you can walk the hall in order.

The only state that persists is your list of saved paper IDs, stored
in `localStorage`.

## Recommendation algorithm

Recommended sort combines three ideas from the recommender-systems
playbook. It runs entirely in the browser against your saved set.

1. **Multi-interest relevance.** Saved papers are leader-clustered by
   cosine similarity (threshold 0.7). Each candidate gets a score via
   log-sum-exp over the non-singleton clusters:
   `τ · log Σ_c exp((cos(v, c̄) · log(1+|c|)) / τ)` with τ=0.3. This
   preserves multi-interest structure — a paper that matches any of
   your themes scores highly — while `log(1+size)` weights clusters
   you've invested more in. Singletons are dropped so one-off saves
   don't steer the feed.
2. **Quality prior.** Rating is folded in as
   `γ · clip((rating − 5) / 2, 0, 1)` with γ=0.8. Papers rated 7.0+
   saturate to the full boost; rating 5.0 gets nothing; missing
   ratings (Journal Track) get a mild 0.3 default.
3. **Diversification (MMR).** The top 250 by relevance get
   re-ranked with Maximal Marginal Relevance at λ=0.75, picking 120
   items by `λ · rel − (1−λ) · max cos-to-already-picked`. This
   interleaves clusters so near-duplicates don't stack, which keeps
   the topic-grouping UI from forming large, mechanical blocks.
4. **Session-stable jitter.** A small noise term (ε=0.10, scaled to
   ~6% of the score spread) is added per paper. The noise is cached
   in a `WeakMap<Float32Array, number>` keyed by embedding-vector
   identity, so filter/query tweaks don't reshuffle the feed, but a
   full page reload assigns fresh values and you see a slightly
   different ordering.

The feed is computed once per saved-set change (a few hundred ms on
5k papers). Filter and query changes reuse a cached
`paper-id → rank-index` map; they're effectively free. Scroll/type
are never blocked by the recommender.

A `RECO_DEBUG=1` offline harness
(`src/composables/reco.debug.test.ts`) benchmarks the algorithm
against a fixed saved-set fixture: distinct topics in top 50, mean
rating, coherence, how the UI would group the top 50 into blocks,
and a noise-ε sweep measuring run-to-run overlap.

## Develop

```sh
npm install
npm run dev     # Vite dev server with HMR
```

Other scripts:

```sh
npm run build       # type-check + build into ./dist
npm run preview     # serve the built bundle locally
npm run lint        # eslint
npm run typecheck   # vue-tsc --noEmit
npm run format      # prettier --write .
```

## Ship

```sh
npm run build
```

The `dist/` folder is self-sufficient — all asset paths are relative,
so you can drop it behind any static host:

```sh
cd dist && python3 -m http.server 8000
# or: rsync to S3 / GitHub Pages / Netlify / your nginx
```

## Stack

- Vue 3 (SFC, `<script setup lang="ts">`, Composition API)
- Vite + `@vitejs/plugin-vue`
- Pinia (state) + VueUse `useLocalStorage` (persistence)
- TypeScript strict; `vue-tsc` in the build pipeline
- ESLint + Prettier

See [`docs/frontend.md`](docs/frontend.md) for code conventions and
[`CLAUDE.md`](CLAUDE.md) for the project map and data contract.

## Data

`public/data/` holds two static JSON files:

- `rated-papers.json` — one record per paper (title, authors,
  abstract, session, poster position, OpenReview ratings, topic
  cluster).
- `embeddings.json` — 128-dim vectors keyed by paper id, used for
  similarity-based sort and the "Similar papers" strip.

They are copied verbatim into `dist/data/` on build and fetched at
runtime with relative paths.
