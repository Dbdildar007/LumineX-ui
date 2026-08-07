import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Compass,
  Eye,
  Film,
  Loader2,
  Play,
  Search,
  Sparkles,
  TrendingUp,
  Users,
  X, Zap
} from "lucide-react";
import {
  PAGE_SIZE,
  fetchCategories,
  fetchRelated,
  fetchVideoPage,
  formatDuration,
  formatViews,
  incrementViews,
  type VideoItem,
} from "@/lib/media";
import { VideoPlayer } from "@/components/VideoPlayer";
import {
  BannerAd,
  NativeBlockAd,
  NativeFeedAd,
  StickyFooterAd,
  interleaveAds,
} from "@/components/ads/AdSlots";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: " luminXn — Watch Short Videos by Category & Cast" },
      {
        name: "description",
        content:
          "Stream bite-size vertical videos. Search instantly by title, category or actor, filter by genre and keep watching with auto-queued similar videos.",
      },
      { property: "og:title", content: "luminXn — Short Video Streaming" },
      {
        property: "og:description",
        content: "Search by title, category or actor. Play instantly, discover similar videos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

// ---------------------------------------------------------------------------
// Header + search (isolated state so typing never re-renders the player)
// ---------------------------------------------------------------------------
function SearchBar({ onSearch }: { onSearch: (q: string) => void }) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => onSearch(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text, onSearch]);

  return (
    <div className="relative w-full [perspective:800px]">
      <div
        className={`pointer-events-none absolute -inset-1 rounded-2xl gradient-hero blur-xl transition-opacity duration-500 ${focused ? "opacity-30" : "opacity-10"
          }`}
      />
      <div
        className={`relative flex w-full items-center gap-3 rounded-2xl border border-white/60 bg-white/45 px-4 py-3 shadow-[0_18px_38px_-22px_rgba(60,30,90,0.7),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-2xl transition ${focused ? "ring-2 ring-primary/40 [transform:translateZ(20px)]" : ""
          }`}
      >
        <Search className={`h-5 w-5 shrink-0 transition ${focused ? "text-primary" : "text-muted-foreground"}`} />
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          enterKeyHint="search"
          placeholder="Search by title, category or actor…"
          className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground"
        />
        {text && (
          <button type="button" onClick={() => setText("")} aria-label="Clear search">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}


export default function GlassHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/20 bg-white/10 backdrop-blur-3xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:h-20 sm:px-6 lg:px-8">

        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 via-violet-600 to-cyan-500 shadow-[0_10px_40px_rgba(139,92,246,0.6)]">

            {/* Glow Ring */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-fuchsia-500/40 to-cyan-500/40 blur-md" />

            {/* Outer Border */}
            <div className="absolute -inset-1 rounded-3xl border border-white/20" />

            {/* Play Icon */}
            <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-white/25 backdrop-blur-md">
              <Play
                fill="white"
                className="ml-0.5 h-4 w-4 text-white drop-shadow-lg"
              />
            </div>

            {/* Accent */}
            <Zap className="absolute -right-1 -top-1 h-3 w-3 text-cyan-300" />
          </div>

          {/* Brand */}
          <div className="min-w-0">
            <h1 className="truncate text-lg font-black tracking-tight sm:text-xl">
              Lumin
              <span className="bg-gradient-to-r from-fuchsia-500 to-cyan-400 bg-clip-text text-transparent">
                X
              </span>
              n
            </h1>

            <p className="hidden text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-500 sm:block">
              Explore The Hype
            </p>
          </div>
        </div>



      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------
function Home() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [active, setActive] = useState<VideoItem | null>(null);

  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});

  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null);

  useEffect(() => {
    const stopPreview = () => setPreviewVideoId(null);

    document.addEventListener("click", stopPreview);

    return () => {
      document.removeEventListener("click", stopPreview);
    };
  }, []);

  const onSearch = useCallback((q: string) => {
    setSearch(q);
    // Searching from anywhere returns to the results-only view (Netflix-style).
    if (q) setActive(null);
  }, []);

  const watchRef = useRef<HTMLDivElement | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const feed = useInfiniteQuery({
    queryKey: ["videos", search, category],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchVideoPage({ search, category, offset: pageParam as number, limit: PAGE_SIZE }),
    getNextPageParam: (last) => last.nextOffset,
    staleTime: 30_000,
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    staleTime: 5 * 60_000,
  });

  const trendingQuery = useQuery({
    queryKey: ["trending"],
    queryFn: () => fetchVideoPage({ limit: 14, sort: "views" }),
    staleTime: 5 * 60_000,
  });


  const withBumps = useCallback(
    (v: VideoItem): VideoItem => ({
      ...v,
      views: viewCounts[v.id] ?? v.views,
    }),
    [viewCounts],
  );


  const videos = useMemo(() => {
    const allVideos = (feed.data?.pages ?? [])
      .flatMap((p) => p.items)
      .map(withBumps);

    return Array.from(
      new Map(allVideos.map((v) => [v.id, v])).values()
    );
  }, [feed.data, withBumps]);


  const total = feed.data?.pages?.[0]?.total ?? 0;
  const trending = useMemo(
    () => (trendingQuery.data?.items ?? []).map(withBumps),
    [trendingQuery.data, withBumps],
  );

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && feed.hasNextPage && !feed.isFetchingNextPage) {
          feed.fetchNextPage();
        }
      },
      { rootMargin: "700px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [feed.hasNextPage, feed.isFetchingNextPage, feed]);

  const openVideo = useCallback((v: VideoItem) => {
    setPreviewVideoId(null);
    setActive(v);
    setAnnouncement(`Now playing ${v.title}`);
  }, []);

  // Jump (no animated scroll) to the player and move focus there, so keyboard
  // and screen-reader users land on the video that just started playing.
  useEffect(() => {
    if (!active) return;
    const timers: number[] = [];
    const settle = () => {
      const el = watchRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY - 12;
      window.scrollTo({ top: Math.max(top, 0), behavior: "auto" });
      if (document.activeElement !== el) el.focus({ preventScroll: true });
    };
    // Re-assert a few times: the player mounting, poster/video loads and feed
    // re-renders can shift layout, and we always want to land on the player.
    settle();
    [0, 60, 160, 320].forEach((d) => timers.push(window.setTimeout(settle, d)));
    return () => timers.forEach(clearTimeout);
  }, [active?.id]);




  // Live view counting: fires 5s into playback, persists in the DB and updates

  const handleViewQualified = useCallback(async (video: VideoItem) => {
    const fresh = await incrementViews(video);

    setViewCounts((prev) => ({
      ...prev,
      [video.id]: fresh,
    }));

    setActive((prev) =>
      prev?.id === video.id
        ? { ...prev, views: fresh }
        : prev
    );
  }, []);


  const activeWithBumps = active ? withBumps(active) : null;
  const isSearching = search.length > 0;

  return (
    <div className="min-h-screen overflow-x-hidden pb-32">
      <GlassHeader />

      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>

      <section className="mx-auto w-full max-w-6xl px-3 pt-3 sm:px-4 sm:pt-4">
        <SearchBar onSearch={onSearch} />
        <BannerAd className="mt-3" />
      </section>

      {activeWithBumps && !isSearching && (
        <section
          ref={watchRef}
          tabIndex={-1}
          aria-label={`Now playing: ${activeWithBumps.title}`}
          className="mx-auto w-full max-w-6xl px-1.5 pt-3 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:px-4 sm:pt-4"
        >
          <WatchView
            key={activeWithBumps.id}
            video={activeWithBumps}
            viewCounts={viewCounts}
            onClose={() => setActive(null)}
            onViewQualified={handleViewQualified}
            onPlay={openVideo}
            previewVideoId={previewVideoId}
            setPreviewVideoId={setPreviewVideoId}
          />
        </section>
      )}


      <CategoryRail
        categories={categoriesQuery.data ?? []}
        active={category}
        onSelect={setCategory}
      />

      {!active && !isSearching && trending.length > 0 && (
        <Section title="Trending Now" icon={<TrendingUp className="h-4 w-4" />}>
          <div className="no-scrollbar overflow-x-auto">
            <div className="flex min-w-max gap-3 px-3 pb-2 sm:px-4">
              {trending.map((v, i) => (
                <div key={v.id} className="w-[160px] shrink-0 sm:w-[190px]">
                  <VideoCard video={v} rank={i + 1} onPlay={() => openVideo(v)} previewVideoId={previewVideoId} setPreviewVideoId={setPreviewVideoId} />
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}

      <Section
        title={
          isSearching
            ? `Results for “${search}” (${total})`
            : category === "All"
              ? "All Videos"
              : category
        }
        icon={isSearching ? <Search className="h-4 w-4" /> : <Film className="h-4 w-4" />}
      >
        {feed.isLoading ? (
          <GridSkeleton />
        ) : videos.length > 0 ? (
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-2.5 px-3 sm:grid-cols-3 sm:gap-3 sm:px-4 md:grid-cols-4 lg:grid-cols-5">
            {interleaveAds(videos, 9, 4).map((entry) =>
              entry.type === "ad" ? (
                <NativeFeedAd key={entry.key} square />
              ) : (
                <VideoCard
                  key={entry.item.id}
                  video={entry.item}
                  onPlay={() => openVideo(entry.item)}
                  previewVideoId={previewVideoId}
                  setPreviewVideoId={setPreviewVideoId}
                />
              ),
            )}
          </div>
        ) : (
          <EmptyState error={feed.isError} />
        )}

        <div ref={sentinelRef} className="flex items-center justify-center py-8">
          {feed.isFetchingNextPage && <Loader2 className="h-6 w-6 animate-spin text-primary" />}
          {!feed.hasNextPage && videos.length > 0 && (
            <span className="text-[11px] font-semibold text-muted-foreground">
              You&apos;re all caught up
            </span>
          )}
        </div>
      </Section>

      <StickyFooterAd />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Watch view — player + similar videos
// ---------------------------------------------------------------------------
function WatchView({
  video,
  viewCounts,
  onClose,
  onViewQualified,
  onPlay,
  previewVideoId,
  setPreviewVideoId,
}: {
  video: VideoItem;
  viewCounts: Record<string, number>;
  onClose: () => void;
  onViewQualified: (v: VideoItem) => void;
  onPlay: (v: VideoItem) => void;
  previewVideoId: string | null;
  setPreviewVideoId: (id: string | null) => void;
}) {
  const related = useQuery({
    queryKey: ["related", video.id, video.category],
    queryFn: () => fetchRelated(video, 24),
    staleTime: 60_000,
  });

  const items = (related.data ?? []).map((v) => ({
    ...v,
    views: viewCounts[v.id] ?? v.views,
  }));
  ``

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between px-1.5 sm:px-0">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-full border border-white/60 bg-white/50 px-3 py-1.5 text-xs font-bold backdrop-blur-xl transition active:scale-95"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
          Now playing
        </span>
      </div>

      <VideoPlayer
        video={video}
        autoPlay
        onViewQualified={onViewQualified}
        onEnded={() => items[0] && onPlay(items[0])}
      />

      <div className="px-1.5 sm:px-0">
        <h1 className="line-clamp-2 text-base font-black leading-tight sm:text-xl">{video.title}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-muted-foreground">
          <span className="flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" /> {formatViews(video.views)} views
          </span>
          <span className="rounded-full border border-white/60 bg-white/50 px-2 py-0.5 backdrop-blur">
            {video.category}
          </span>
          <span>{formatDuration(video.durationSeconds)}</span>
        </div>
        {video.actors.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-primary" />
            {video.actors.map((a) => (
              <span
                key={a}
                className="rounded-full border border-white/60 bg-white/45 px-2 py-0.5 text-[11px] font-bold backdrop-blur"
              >
                {a}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="px-1.5 sm:px-0">
        <NativeBlockAd />
      </div>

      <div className="px-1.5 sm:px-0">
        <div className="mb-3 flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-xl border border-white/60 bg-white/50 text-primary backdrop-blur">
            <Play className="h-4 w-4" />
          </div>
          <h2 className="text-base font-black tracking-tight">Similar Videos</h2>
        </div>
        {related.isLoading ? (
          <GridSkeleton />
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5">
            {interleaveAds(items, 8, 4).map((entry) =>
              entry.type === "ad" ? (
                <NativeFeedAd key={entry.key} square />
              ) : (
                <VideoCard
                  key={entry.item.id}
                  video={entry.item}
                  onPlay={() => onPlay(entry.item)}
                  previewVideoId={previewVideoId}
                  setPreviewVideoId={setPreviewVideoId}
                />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7">
      <div className="mx-auto mb-3 flex max-w-6xl items-center gap-2 px-3 sm:px-4">
        <div className="grid h-7 w-7 place-items-center rounded-xl border border-white/60 bg-white/50 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur">
          {icon}
        </div>
        <h2 className="truncate text-base font-black tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function CategoryRail({
  categories,
  active,
  onSelect,
}: {
  categories: string[];
  active: string;
  onSelect: (c: string) => void;
}) {
  const all = ["All", ...categories];
  return (
    <section className="mt-6">
      <div className="mx-auto mb-3 flex max-w-6xl items-center gap-2 px-3 sm:px-4">
        <div className="grid h-7 w-7 place-items-center rounded-xl border border-white/60 bg-white/50 text-primary backdrop-blur">
          <Compass className="h-4 w-4" />
        </div>
        <h2 className="text-base font-black tracking-tight">Categories</h2>
      </div>
      <div className="no-scrollbar overflow-x-auto">
        <div className="flex min-w-max gap-2 px-3 pb-2 sm:px-4">
          {all.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onSelect(c)}
              aria-pressed={active === c}
              aria-label={`Filter by ${c} category`}
              className={`shrink-0 whitespace-nowrap rounded-2xl px-4 py-2 text-xs font-black transition active:scale-95 ${active === c
                ? "gradient-hero text-primary-foreground glow-primary"
                : "border border-white/60 bg-white/45 text-foreground/80 backdrop-blur-xl hover:bg-white/70"
                }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function VideoCard({
  video,
  rank,
  onPlay,
  previewVideoId, setPreviewVideoId,
}: {
  video: VideoItem;
  rank?: number;
  onPlay: () => void;
  previewVideoId: string | null;
  setPreviewVideoId: (id: string | null) => void;
}) {

  const preview = previewVideoId === video.id;


  const vidRef = useRef<HTMLVideoElement | null>(null);

  const longPressed = useRef(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const hoverTimer = useRef<NodeJS.Timeout | null>(null);

  const isTouchDevice = () => {
    return (
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0
    );
  };

  const handleMouseEnter = () => {
    if (!isTouchDevice()) {
      // Desktop only: wait 2s of sustained hover before starting the preview.
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      hoverTimer.current = setTimeout(() => setPreviewVideoId(video.id), 2000);

    }
  };

  const handleMouseLeave = () => {
    if (!isTouchDevice()) {
      if (hoverTimer.current) {
        clearTimeout(hoverTimer.current);
        hoverTimer.current = null;
      }
      setPreviewVideoId(null);
    }
  };

  useEffect(() => {
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    };
  }, []);


  const handleTouchStart = () => {
    longPressed.current = false;

    longPressTimer.current = setTimeout(() => {
      longPressed.current = true;

      setPreviewVideoId(video.id);
    }, 600);
  };

  const handleClick = () => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }

    onPlay();
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  // Keyboard support: Enter/Space plays (native button), P toggles the muted
  // preview, Escape stops it. Announced to screen readers via aria-pressed.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "p" || e.key === "P") {
      e.preventDefault();
      setPreviewVideoId(preview ? null : video.id);
    } else if (e.key === "Escape" && preview) {
      e.preventDefault();
      setPreviewVideoId(null);
    }
  };


  useEffect(() => {
    const v = vidRef.current;
    if (!v) return;
    if (preview) v.play().catch(() => { });
    else {
      v.pause();
      v.currentTime = 0;
    }
  }, [preview]);

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onKeyDown={handleKeyDown}
      onFocus={() => setPreviewVideoId(null)}
      aria-label={`Play ${video.title}. ${video.category}, ${formatDuration(video.durationSeconds)}, ${formatViews(video.views)} views${video.actors[0] ? `, starring ${video.actors.join(", ")}` : ""}. Press P to preview.`}
      aria-pressed={preview}
      className={`group relative w-full overflow-hidden rounded-2xl border border-white/55 bg-white/40 text-left shadow-[0_18px_35px_-22px_rgba(50,20,80,0.85),inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-xl transition-all duration-300 [perspective:900px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.97] ${preview ? "z-10 md:scale-[1.06] md:shadow-[0_28px_55px_-18px_rgba(40,15,70,0.6)]" : ""
        }`}
    >
      <div className="relative aspect-[9/13] w-full">
        <img
          src={video.poster}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${preview ? "opacity-0" : "opacity-100"}`}
        />

        <video
          ref={vidRef}
          src={video.videoUrl}
          muted
          loop
          playsInline
          preload="none"
          aria-hidden="true"
          tabIndex={-1}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${preview ? "opacity-100" : "opacity-0"}`}
        />
        {/* Every overlay (gradient, rank, duration, play hint, meta) hides while
            the preview plays — both desktop hover and mobile long-press. */}
        {!preview && (
          <>
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />

            {rank !== undefined && (
              <span className="absolute left-2 top-2 grid h-7 min-w-7 place-items-center rounded-xl border border-white/40 bg-white/25 px-1.5 text-xs font-black text-white backdrop-blur-xl">
                {rank}
              </span>
            )}

            <span className="absolute right-2 top-2 rounded-lg border border-white/30 bg-black/45 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur">
              {formatDuration(video.durationSeconds)}
            </span>

            <span className="pointer-events-none absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100">
              <span className="grid h-12 w-12 place-items-center rounded-full border border-white/50 bg-white/20 text-white backdrop-blur-xl">
                <Play className="h-5 w-5 fill-current pl-0.5" />
              </span>
            </span>

            <div className="absolute inset-x-0 bottom-0 p-2.5 text-white">
              <div className="truncate text-[9px] font-bold uppercase tracking-[0.15em] text-white/75">
                {video.category}
              </div>
              <div className="line-clamp-2 text-[13px] font-black leading-tight">{video.title}</div>
              <div className="mt-1 flex items-center gap-2 text-[10px] font-semibold text-white/80">
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" /> {formatViews(video.views)}
                </span>
                {video.actors[0] && <span className="truncate">{video.actors[0]}</span>}
              </div>
            </div>
          </>
        )}
      </div>
    </button>
  );
}


function GridSkeleton() {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-2 gap-2.5 px-3 sm:grid-cols-3 sm:gap-3 sm:px-4 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="aspect-[9/13] w-full rounded-2xl shimmer border border-white/50" />
      ))}
    </div>
  );
}

function EmptyState({ error }: { error: boolean }) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col items-center justify-center px-4 py-16 text-center">
      <Search className="mb-3 h-8 w-8 text-muted-foreground" />
      <h3 className="text-sm font-bold">{error ? "Couldn't load the library" : "No videos found"}</h3>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
        {error
          ? "The catalogue is unreachable right now. Try again in a moment."
          : "Nothing matches this keyword or category yet."}
      </p>
    </div>
  );
}
