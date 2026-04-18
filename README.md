# Conference Navigator — ICLR 2026

A small static web app for exploring and planning a route through ICLR
2026 posters. No backend. Build it, upload the `dist/` folder to any
static host, and you're done.

Two tabs:

- **Explore** — a filterable, searchable list of every paper. Sort by
  recommendation (cosine-similarity to your saved set), similarity to
  a seed paper, rating, schedule time, poster ID, or spotlights first.
- **My schedule** — your saved papers grouped by session and ordered
  by poster number, so you can walk the hall in order.

The only state that persists is your list of saved paper IDs, stored
in `localStorage`.

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
