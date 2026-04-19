import type { Block, Paper, SessionGroup, Tier } from "@/types";

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function groupBySession(papers: Paper[]): SessionGroup[] {
  const groups: Record<string, SessionGroup> = {};
  for (const p of papers) {
    const key = p.session || "Unscheduled";
    if (!groups[key])
      groups[key] = {
        session: key,
        papers: [],
        start: p.start,
        day: p.day,
        room: p.room,
      };
    groups[key].papers.push(p);
  }
  return Object.values(groups).sort((a, b) =>
    (a.start || "").localeCompare(b.start || ""),
  );
}

/**
 * Collapse dense runs of same-topic papers in a reco-sorted list into
 * topic groups. A group is triggered when the current paper's topic has
 * `minGroup`+ unprocessed matches within the next `windowSize` rows,
 * and then extended forward as long as another same-topic paper appears
 * within `windowSize` rows of the last group member. The rest render
 * as individual singles at their natural rank.
 */
export function groupByTopicRuns(
  sorted: Paper[],
  opts: { windowSize?: number; minGroup?: number } = {},
): Block[] {
  const windowSize = opts.windowSize ?? 30;
  const minGroup = opts.minGroup ?? 3;
  const blocks: Block[] = [];
  const processed = new Set<string>();
  const N = sorted.length;

  for (let i = 0; i < N; i++) {
    const p = sorted[i];
    if (processed.has(p.id)) continue;
    const topic = p.topic_cluster || null;
    if (!topic) {
      blocks.push({ kind: "single", paper: p });
      processed.add(p.id);
      continue;
    }

    const matches: { paper: Paper; idx: number }[] = [];
    const end = Math.min(N, i + windowSize);
    for (let j = i; j < end; j++) {
      const q = sorted[j];
      if (processed.has(q.id)) continue;
      if (q.topic_cluster === topic) matches.push({ paper: q, idx: j });
    }

    if (matches.length < minGroup) {
      blocks.push({ kind: "single", paper: p });
      processed.add(p.id);
      continue;
    }

    let lastIdx = matches[matches.length - 1].idx;
    const groupPapers: Paper[] = matches.map((m) => m.paper);
    for (const m of matches) processed.add(m.paper.id);

    while (true) {
      const extEnd = Math.min(N, lastIdx + 1 + windowSize);
      const ext: { paper: Paper; idx: number }[] = [];
      for (let j = lastIdx + 1; j < extEnd; j++) {
        const q = sorted[j];
        if (processed.has(q.id)) continue;
        if (q.topic_cluster === topic) ext.push({ paper: q, idx: j });
      }
      if (ext.length === 0) break;
      for (const e of ext) {
        groupPapers.push(e.paper);
        processed.add(e.paper.id);
      }
      lastIdx = ext[ext.length - 1].idx;
    }

    blocks.push({ kind: "group", topic, papers: groupPapers });
  }

  return blocks;
}

export function uniqueClusters(papers: Paper[]): string[] {
  const s = new Set<string>();
  for (const p of papers) if (p.topic_cluster) s.add(p.topic_cluster);
  return Array.from(s).sort();
}

export function uniqueInsts(papers: Paper[]): string[] {
  const counts: Record<string, number> = {};
  for (const p of papers)
    for (const a of p.authors)
      if (a.inst) counts[a.inst] = (counts[a.inst] || 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map((e) => e[0]);
}

export function uniqueSessions(papers: Paper[]): string[] {
  const s = new Set<string>();
  for (const p of papers) if (p.session) s.add(p.session);
  return Array.from(s).sort();
}

export function tierText(paper: Paper): string {
  if (paper.tier === "Spotlight") return "Spotlight";
  if (paper.event_type === "Oral") return "Oral";
  if (paper.tier === "Oral") return "Oral Poster";
  if (paper.event_type === "Blog Track Poster") return "Blog";
  if (paper.event_type === "Journal Track Poster") return "Journal";
  return "Poster";
}

export function tierClass(paper: Paper): string {
  if (paper.tier === "Spotlight") return "spotlight";
  if (paper.event_type === "Oral" || (paper.tier as Tier) === "Oral")
    return "oral";
  return "";
}
