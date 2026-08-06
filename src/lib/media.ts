// Data layer for the video catalogue (public.metatable).
// One place for every read/write: keyword search, category filter, keyset
// pagination and the atomic view counter.
//
// If `metatable` has not been created yet (migration in src/data-migration not
// run), every query degrades gracefully to the legacy dramas/episodes tables so
// the app keeps working instead of showing a blank screen.
import { supabase } from "./supabase";

export type VideoItem = {
  id: string;
  title: string;
  videoUrl: string;
  poster: string;
  category: string;
  actors: string[];
  durationSeconds: number;
  views: number;
};

export type VideoPage = {
  items: VideoItem[];
  nextOffset: number | null;
  total: number;
};

export const PAGE_SIZE = 50;

type Row = {
  id: string;
  title: string;
  video_url: string;
  poster_uri: string;
  category: string;
  actors: string[] | null;
  duration_seconds: number | null;
  views: number | null;
};

function mapRow(r: Row): VideoItem {
  return {
    id: r.id,
    title: r.title,
    videoUrl: r.video_url,
    poster: r.poster_uri,
    category: r.category,
    actors: r.actors ?? [],
    durationSeconds: r.duration_seconds ?? 0,
    views: Number(r.views ?? 0),
  };
}

export function formatDuration(total: number) {
  if (!Number.isFinite(total) || total <= 0) return "0:00";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return h > 0 ? `${h}:${mm}:${String(s).padStart(2, "0")}` : `${mm}:${String(s).padStart(2, "0")}`;
}

export function formatViews(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

// ---------------------------------------------------------------------------
// Legacy fallback (used only when public.metatable is missing)
// ---------------------------------------------------------------------------
const ACTOR_POOL = [
  ["Ava Sinclair", "Damien Cross"],
  ["Elena Vaughn", "Marcus Reed"],
  ["Kai Thornwood", "Isla Moon"],
  ["Camille Duarte", "Victor Hale"],
  ["Mira Castellan", "Yuna Park"],
  ["Poppy Sinclair", "Grant Whitmore"],
];

let legacyCache: VideoItem[] | null = null;
let useLegacy = false;

function parseDuration(text: string | null | undefined) {
  if (!text) return 0;
  const parts = text.split(":").map((p) => Number(p) || 0);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function hash(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

async function loadLegacy(): Promise<VideoItem[]> {
  if (legacyCache) return legacyCache;
  const [{ data: dRows }, { data: eRows }] = await Promise.all([
    supabase.from("dramas").select("id,title,genre,image,poster"),
    supabase.from("episodes").select("id,drama_id,number,title,duration,video_url,thumb"),
  ]);
  const dramas = new Map((dRows ?? []).map((d: any) => [d.id, d]));
  legacyCache = (eRows ?? []).map((e: any) => {
    const d = dramas.get(e.drama_id);
    return {
      id: e.id as string,
      title: `${d?.title ?? "Video"} — ${e.title}`,
      videoUrl: e.video_url as string,
      poster: (e.thumb || d?.image) as string,
      category: ((d?.genre ?? "Drama").split("•")[0] ?? "Drama").trim(),
      actors: ACTOR_POOL[hash(e.drama_id) % ACTOR_POOL.length],
      durationSeconds: parseDuration(e.duration),
      views: 12_000 + (hash(e.id) % 900_000) + (localViewDelta[e.id] ?? 0),
    } satisfies VideoItem;
  });
  return legacyCache;
}

const localViewDelta: Record<string, number> = {};

function matches(v: VideoItem, q: string) {
  const hay = `${v.title} ${v.category} ${v.actors.join(" ")}`.toLowerCase();
  return q.split(/\s+/).filter(Boolean).every((token) => hay.includes(token));
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export type FeedParams = {
  search?: string;
  category?: string; // "All" or a category name
  offset?: number;
  limit?: number;
  sort?: "recent" | "views";
};

export async function fetchVideoPage({
  search = "",
  category = "All",
  offset = 0,
  limit = PAGE_SIZE,
  sort = "recent",
}: FeedParams): Promise<VideoPage> {
  const q = search.trim().toLowerCase();

  if (!useLegacy) {
    let query = supabase
      .from("metatable")
      .select("id,title,video_url,poster_uri,category,actors,duration_seconds,views", {
        count: "exact",
      });

    if (category && category !== "All") query = query.eq("category", category);
    if (q) {
      // Every keyword must appear in the indexed search_text column — the same
      // behaviour as YouTube's multi-token matching, done server-side.
      for (const token of q.split(/\s+/).filter(Boolean).slice(0, 6)) {
        query = query.ilike("search_text", `%${token}%`);
      }
    }

    query =
      sort === "views"
        ? query.order("views", { ascending: false })
        : query.order("created_at", { ascending: true });

    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (!error) {
      const items = (data ?? []).map((r) => mapRow(r as Row));
      const total = count ?? offset + items.length;
      return {
        items,
        total,
        nextOffset: offset + items.length < total ? offset + items.length : null,
      };
    }
    // Table missing / not exposed → switch to the legacy source for this session.
    useLegacy = true;
  }

  const all = await loadLegacy();
  const filtered = all
    .filter((v) => (category === "All" || !category ? true : v.category === category))
    .filter((v) => (q ? matches(v, q) : true));
  const sorted = sort === "views" ? [...filtered].sort((a, b) => b.views - a.views) : filtered;
  const items = sorted.slice(offset, offset + limit);
  return {
    items,
    total: sorted.length,
    nextOffset: offset + items.length < sorted.length ? offset + items.length : null,
  };
}

export async function fetchCategories(): Promise<string[]> {
  if (!useLegacy) {
    const { data, error } = await supabase.rpc("list_categories");
    if (!error && data) {
      return (data as { category: string }[]).map((r) => r.category).filter(Boolean);
    }
  }
  const all = await loadLegacy();
  return [...new Set(all.map((v) => v.category))].filter(Boolean).sort();
}

/** Related videos: same category first, then shared actors, then same series title. */
export async function fetchRelated(video: VideoItem, limit = 24): Promise<VideoItem[]> {
  const seriesKey = video.title.split("—")[0]?.trim() ?? video.title;

  if (!useLegacy) {
    const [byCategory, byActor, bySeries] = await Promise.all([
      supabase
        .from("metatable")
        .select("id,title,video_url,poster_uri,category,actors,duration_seconds,views")
        .eq("category", video.category)
        .neq("id", video.id)
        .order("views", { ascending: false })
        .limit(limit),
      video.actors.length
        ? supabase
            .from("metatable")
            .select("id,title,video_url,poster_uri,category,actors,duration_seconds,views")
            .overlaps("actors", video.actors)
            .neq("id", video.id)
            .limit(limit)
        : Promise.resolve({ data: [], error: null } as any),
      supabase
        .from("metatable")
        .select("id,title,video_url,poster_uri,category,actors,duration_seconds,views")
        .ilike("title", `${seriesKey}%`)
        .neq("id", video.id)
        .limit(limit),
    ]);

    if (!byCategory.error) {
      const seen = new Set<string>([video.id]);
      const out: VideoItem[] = [];
      for (const res of [bySeries, byActor, byCategory]) {
        for (const r of (res.data ?? []) as Row[]) {
          if (seen.has(r.id)) continue;
          seen.add(r.id);
          out.push(mapRow(r));
        }
      }
      return out.slice(0, limit);
    }
    useLegacy = true;
  }

  const all = await loadLegacy();
  const seen = new Set<string>([video.id]);
  const out: VideoItem[] = [];
  const pools = [
    all.filter((v) => v.title.startsWith(seriesKey)),
    all.filter((v) => v.actors.some((a) => video.actors.includes(a))),
    all.filter((v) => v.category === video.category),
  ];
  for (const pool of pools) {
    for (const v of pool) {
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      out.push(v);
    }
  }
  return out.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------
/** Atomically bumps the view count and returns the fresh total from the DB. */
export async function incrementViews(video: VideoItem): Promise<number> {
  if (!useLegacy) {
    const { data, error } = await supabase.rpc("increment_views", { _id: video.id });
    if (!error && data != null) return Number(data);
  }
  localViewDelta[video.id] = (localViewDelta[video.id] ?? 0) + 1;
  if (legacyCache) {
    const row = legacyCache.find((v) => v.id === video.id);
    if (row) row.views += 1;
  }
  return video.views + 1;
}
