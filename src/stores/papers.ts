import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { DayDef, Paper, RawPaper } from "@/types";

function adaptPaper(raw: RawPaper): Paper {
  const pres = raw.presentation || {};
  const mats = raw.materials || {};
  const or = raw.openreview || null;
  const meta = raw.metadata || {};

  const start = pres.start_time || "";
  const end = pres.end_time || "";
  const date = start.slice(0, 10);

  return {
    id: raw.id,
    title: raw.title,
    abstract: raw.abstract,
    authors: (raw.authors || []).map((a) => ({
      name: a.name,
      inst: a.institution || "",
    })),
    event_type: raw.event_type,
    tier: raw.tier,
    topic_cluster: meta.topic ?? null,
    session: pres.session || null,
    room: pres.room || "",
    poster_pos: pres.poster_position || null,
    poster_idx: pres.poster_position_idx ?? null,
    day: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    start: start.slice(11, 16),
    end: end.slice(11, 16),
    rating: or ? or.avg_rating : null,
    ratings: or ? or.ratings : [],
    openreview_url: mats.openreview_url || null,
    virtual_url: mats.virtual_url || null,
    code_url: mats.code_url || null,
    slides_url: mats.slides_url || null,
    poster_image_url: mats.poster_image_url || null,
  };
}

function buildDayDef(date: string): DayDef {
  // Use UTC so the date string doesn't drift with the user's local timezone.
  const d = new Date(date + "T00:00:00Z");
  return {
    date,
    short: d.toLocaleDateString("en-US", {
      weekday: "short",
      timeZone: "UTC",
    }),
    long: d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
    pretty: d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }),
  };
}

function buildEmbeddings(
  obj: Record<string, number[]>,
): Map<string, Float32Array> {
  const map = new Map<string, Float32Array>();
  for (const id in obj) {
    const arr = obj[id];
    if (!Array.isArray(arr) || !arr.length) continue;
    const v = new Float32Array(arr);
    let sq = 0;
    for (let i = 0; i < v.length; i++) sq += v[i] * v[i];
    const n = Math.sqrt(sq) || 1;
    for (let i = 0; i < v.length; i++) v[i] /= n;
    map.set(id, v);
  }
  return map;
}

export const usePapersStore = defineStore("papers", () => {
  const papers = ref<Paper[]>([]);
  const embeddings = ref<Map<string, Float32Array> | null>(null);
  const loaded = ref(false);
  const loadError = ref<string | null>(null);

  const dayDefs = computed<DayDef[]>(() => {
    const dates = new Set<string>();
    for (const p of papers.value) if (p.day) dates.add(p.day);
    return [...dates].sort().map(buildDayDef);
  });

  function dayDef(date: string | null | undefined): DayDef | null {
    if (!date) return null;
    return dayDefs.value.find((d) => d.date === date) || null;
  }

  async function load() {
    try {
      const base = import.meta.env.BASE_URL;
      const v = __DATA_VERSION__;
      const [papersRes, embRes] = await Promise.all([
        fetch(`${base}data/rated-papers.json?v=${v}`),
        fetch(`${base}data/embeddings.json?v=${v}`),
      ]);
      if (!papersRes.ok) throw new Error(`papers HTTP ${papersRes.status}`);
      if (!embRes.ok) throw new Error(`embeddings HTTP ${embRes.status}`);
      const [rawPapers, rawEmb] = (await Promise.all([
        papersRes.json(),
        embRes.json(),
      ])) as [RawPaper[], Record<string, number[]>];
      papers.value = rawPapers.map(adaptPaper);
      embeddings.value = buildEmbeddings(rawEmb);
      loaded.value = true;
    } catch (e) {
      loadError.value = String(e);
      console.error("Failed to load:", e);
    }
  }

  function vecFor(paper: Paper | null | undefined): Float32Array | null {
    if (!paper || !embeddings.value) return null;
    return embeddings.value.get(paper.id) || null;
  }

  return {
    papers,
    embeddings,
    loaded,
    loadError,
    dayDefs,
    dayDef,
    load,
    vecFor,
  };
});
