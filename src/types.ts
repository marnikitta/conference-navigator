export type Tab = "explore" | "schedule";

export type Sort = "reco" | "similar" | "rating" | "time" | "poster_id";

/** ISO date string, e.g. "2026-04-24". Inferred from paper data at load time. */
export type Day = string;

export interface DayDef {
  /** ISO date "YYYY-MM-DD" */
  date: Day;
  /** "Fri" */
  short: string;
  /** "Friday" */
  long: string;
  /** "Apr 24" */
  pretty: string;
}

export type Tier = "Oral" | "Spotlight" | "Poster";

export interface RawAuthor {
  name: string;
  institution?: string;
}

export interface RawPresentation {
  session?: string | null;
  room?: string;
  poster_position?: string | null;
  start_time?: string;
  end_time?: string;
}

export interface RawMaterials {
  openreview_url?: string;
  code_url?: string;
  slides_url?: string;
  poster_image_url?: string;
  virtual_url?: string;
}

export interface RawOpenreview {
  tldr?: string | null;
  keywords?: string[];
  ratings: number[];
}

export interface RawMetadata {
  topic_id?: number;
  topic?: string | null;
  summary_short?: string | null;
  summary_long?: string | null;
}

export interface RawPaper {
  id: string;
  title: string;
  abstract: string;
  authors: RawAuthor[];
  event_type?: string;
  tier: Tier;
  presentation?: RawPresentation;
  materials?: RawMaterials;
  openreview?: RawOpenreview | null;
  metadata?: RawMetadata;
}

export interface PaperAuthor {
  name: string;
  inst: string;
}

export interface Paper {
  id: string;
  title: string;
  abstract: string;
  authors: PaperAuthor[];
  event_type?: string;
  tier: Tier;
  topic_cluster: string | null;
  summary_short: string | null;
  summary_long: string | null;
  session: string | null;
  room: string;
  poster_pos: string | null;
  poster_idx: number | null;
  day: Day | null;
  start: string;
  end: string;
  rating: number | null;
  ratings: number[];
  tldr: string | null;
  keywords: string[];
  openreview_url: string | null;
  virtual_url: string | null;
  code_url: string | null;
  slides_url: string | null;
  poster_image_url: string | null;
}

export interface Filters {
  days?: Day[];
  eventTypes?: string[];
  clusters?: string[];
  insts?: string[];
  sessions?: string[];
  spotlightOnly?: boolean;
  minRating?: number;
  savedOnly?: boolean;
  showSaved?: boolean;
}

export interface SessionGroup {
  session: string;
  papers: Paper[];
  start: string;
  day: Day | null;
  room: string;
}
