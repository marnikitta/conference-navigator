import type { Paper, SessionGroup, Tier } from "@/types";

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function groupBySession(papers: Paper[]): SessionGroup[] {
  const groups: Record<string, SessionGroup> = {};
  for (const p of papers) {
    const key = p.session || "Unscheduled";
    let g = groups[key];
    if (!g) {
      g = groups[key] = {
        session: key,
        papers: [],
        start: p.start,
        day: p.day,
        room: p.room,
        start_ms: p.start_ms,
        end_ms: p.end_ms,
      };
    } else {
      if (p.start_ms != null)
        g.start_ms =
          g.start_ms == null ? p.start_ms : Math.min(g.start_ms, p.start_ms);
      if (p.end_ms != null)
        g.end_ms =
          g.end_ms == null ? p.end_ms : Math.max(g.end_ms, p.end_ms);
    }
    g.papers.push(p);
  }
  return Object.values(groups).sort((a, b) =>
    (a.start || "").localeCompare(b.start || ""),
  );
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

export interface SessionMeta {
  name: string;
  day: string | null;
  total: number;
  start_ms: number | null;
  end_ms: number | null;
}

/**
 * Sessions with total paper counts, sorted by (day, name). Alphabetical
 * within day — with natural-numeric compare so "Session 2" precedes
 * "Session 10".
 */
export function sessionsWithMeta(papers: Paper[]): SessionMeta[] {
  const metas = new Map<string, SessionMeta>();
  for (const p of papers) {
    if (!p.session) continue;
    const cur = metas.get(p.session);
    if (cur) {
      cur.total++;
      if (p.start_ms != null)
        cur.start_ms =
          cur.start_ms == null
            ? p.start_ms
            : Math.min(cur.start_ms, p.start_ms);
      if (p.end_ms != null)
        cur.end_ms =
          cur.end_ms == null ? p.end_ms : Math.max(cur.end_ms, p.end_ms);
    } else {
      metas.set(p.session, {
        name: p.session,
        day: p.day,
        total: 1,
        start_ms: p.start_ms,
        end_ms: p.end_ms,
      });
    }
  }
  return Array.from(metas.values()).sort((a, b) => {
    const d = (a.day || "").localeCompare(b.day || "");
    if (d !== 0) return d;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
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
