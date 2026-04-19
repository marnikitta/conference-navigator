import type { Paper, SessionGroup, Tier } from "@/types";

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
