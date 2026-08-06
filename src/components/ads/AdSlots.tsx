import { useState } from "react";
import { Megaphone, Sparkles, X } from "lucide-react";

/**
 * Ad slots — mobile-first, responsive, purely presentational.
 * Swap the inner markup for a real ad network script/iframe later; the
 * containers already reserve the right responsive space to avoid layout shift.
 */

const GLASS =
  "relative overflow-hidden rounded-2xl border border-white/55 bg-white/40 backdrop-blur-xl shadow-[0_18px_38px_-22px_rgba(60,30,90,0.7),inset_0_1px_0_rgba(255,255,255,0.85)]";

function AdLabel({ className = "" }: { className?: string }) {
  return (
    <span
      className={`rounded-md border border-white/50 bg-white/50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground backdrop-blur ${className}`}
    >
      Ad
    </span>
  );
}

/** 1.1 — Top banner, directly below the search bar. */
export function BannerAd({ className = "" }: { className?: string }) {
  return (
    <div className={`${GLASS} [perspective:900px] ${className}`}>
      <div className="pointer-events-none absolute -inset-8 gradient-hero opacity-15 blur-2xl" />
      <div className="relative flex h-[80px] items-center gap-3 px-3 sm:h-[100px] sm:px-5 lg:h-[120px]">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/60 bg-white/50 text-primary backdrop-blur sm:h-12 sm:w-12">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <AdLabel />
            <span className="truncate text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Sponsored
            </span>
          </div>
          <p className="mt-0.5 truncate text-sm font-black leading-tight sm:text-base">
            Your brand, front and centre
          </p>
          <p className="hidden truncate text-xs font-semibold text-muted-foreground sm:block">
            Responsive banner placement — 320x80 up to 970x120.
          </p>
        </div>
        <span className="shrink-0 rounded-full gradient-hero px-3 py-1.5 text-[11px] font-black text-primary-foreground">
          Learn more
        </span>
      </div>
    </div>
  );
}

/** 1.2 / 2 / 3 — In-feed native ad occupying one video-card slot. */
export function NativeFeedAd({
  className = "",
  square = false,
}: {
  className?: string;
  square?: boolean;
}) {
  return (
    <div className={`${GLASS} [perspective:900px] ${className}`}>
      <div className={`relative w-full ${square ? "aspect-square" : "aspect-[9/13]"}`}>
        <div className="absolute inset-0 gradient-hero opacity-80" />
        <div className="pointer-events-none absolute -inset-6 gradient-hero opacity-25 blur-2xl" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
        <AdLabel className="absolute left-2 top-2" />
        <div className="absolute inset-x-0 bottom-0 p-2 text-white sm:p-2.5">
          <div className="truncate text-[9px] font-bold uppercase tracking-[0.15em] text-white/75">
            Sponsored
          </div>
          <div className="line-clamp-2 text-[12px] font-black leading-tight sm:text-[13px]">
            Promote your app right inside the feed
          </div>
          <div className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-white/40 bg-white/20 px-2 py-1 text-[10px] font-black backdrop-blur">
            <Megaphone className="h-3 w-3" /> Install
          </div>
        </div>
      </div>
    </div>
  );
}


/** Native ad that spans the full content width (below the player). */
export function NativeBlockAd({ className = "" }: { className?: string }) {
  return (
    <div className={`${GLASS} ${className}`}>
      <div className="pointer-events-none absolute -inset-8 gradient-hero opacity-15 blur-2xl" />
      <div className="relative flex items-center gap-3 p-3 sm:p-4">
        <div className="h-16 w-24 shrink-0 overflow-hidden rounded-xl gradient-hero sm:h-20 sm:w-32" />
        <div className="min-w-0 flex-1">
          <AdLabel />
          <p className="mt-1 line-clamp-2 text-sm font-black leading-tight sm:text-base">
            Recommended for you — sponsored pick of the week
          </p>
          <p className="mt-0.5 line-clamp-1 text-xs font-semibold text-muted-foreground">
            Native placement blends with the video details.
          </p>
        </div>
        <span className="shrink-0 rounded-full gradient-hero px-3 py-1.5 text-[11px] font-black text-primary-foreground">
          Open
        </span>
      </div>
    </div>
  );
}

/** 1.3 — Sticky mobile footer ad (dismissible, mobile-first). */
export function StickyFooterAd() {
  const [closed, setClosed] = useState(false);
  if (closed) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-2 pb-2 sm:px-4 sm:pb-3">
      <div className={`${GLASS} mx-auto flex max-w-3xl items-center gap-2.5 px-2.5 py-2`}>
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg gradient-hero text-primary-foreground">
          <Megaphone className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <AdLabel />
            <span className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Sponsored
            </span>
          </div>
          <p className="truncate text-[12px] font-black leading-tight">
            Sticky footer placement — 320x50
          </p>
        </div>
        <span className="shrink-0 rounded-full gradient-hero px-2.5 py-1 text-[10px] font-black text-primary-foreground">
          Get
        </span>
        <button
          type="button"
          onClick={() => setClosed(true)}
          aria-label="Close ad"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/60 bg-white/60 text-muted-foreground backdrop-blur"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** 5 — Pause ad overlay, shown inside the player when paused. Mobile-first. */
export function PauseAdOverlay({ onClose }: { onClose?: () => void }) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center p-2 sm:p-5">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[3px]" />
      <div className="relative flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-xl border border-white/35 bg-white/15 p-2 text-white shadow-[0_30px_60px_-25px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.6)] backdrop-blur-2xl sm:rounded-2xl sm:p-4">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <span className="rounded-md border border-white/40 bg-white/20 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.18em] sm:text-[9px]">
            Ad
          </span>
          {onClose && (
            <button
              type="button"
              data-control
              onClick={onClose}
              aria-label="Close pause ad"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/40 bg-white/20 active:scale-95"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="mt-1.5 flex min-h-0 items-center gap-2.5 sm:mt-2 sm:flex-col sm:items-stretch sm:gap-0">
          <div className="h-14 w-24 shrink-0 overflow-hidden rounded-lg gradient-hero opacity-90 sm:h-auto sm:w-full sm:rounded-xl sm:aspect-[16/7]" />
          <div className="min-w-0 flex-1 sm:mt-2">
            <p className="line-clamp-2 text-[12px] font-black leading-tight sm:text-base">
              Paused? Discover our sponsor
            </p>
            <p className="mt-0.5 line-clamp-1 text-[10px] font-semibold text-white/80 sm:text-[11px]">
              Large pause creative — fully responsive.
            </p>
            <span className="mt-1.5 inline-flex rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-black text-black sm:mt-2 sm:px-3 sm:py-1.5 sm:text-[11px]">
              Learn more
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}


/** 4 — Pre-roll ad with visible countdown; blocks player controls. */
export function PreRollOverlay({
  remaining,
  total,
  canSkip,
  onSkip,
}: {
  remaining: number;
  total: number;
  canSkip: boolean;
  onSkip: () => void;
}) {
  const pct = total > 0 ? ((total - remaining) / total) * 100 : 0;
  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-black">
      <div className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0 gradient-hero opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40" />
        <div className="absolute left-2 top-2 flex items-center gap-2 sm:left-3 sm:top-3">
          <span className="rounded-md bg-[oklch(0.72_0.2_12)] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-white">
            Ad
          </span>
          <span className="rounded-full border border-white/30 bg-black/45 px-2 py-0.5 text-[11px] font-black tabular-nums text-white backdrop-blur">
            {remaining}s
          </span>
        </div>
        {canSkip && (
          <button
            type="button"
            data-control
            onClick={onSkip}
            className="absolute bottom-3 right-2 rounded-full border border-white/40 bg-white/20 px-3 py-1.5 text-[11px] font-black text-white backdrop-blur-xl transition active:scale-95 sm:right-3"
          >
            Skip ad
          </button>
        )}
        <div className="pointer-events-none absolute inset-0 grid place-items-center px-4 text-center">
          <div className="max-w-xs text-white sm:max-w-sm">
            <p className="text-base font-black leading-tight sm:text-2xl">
              Your video starts in {remaining}s
            </p>
            <p className="mt-1 text-[11px] font-semibold text-white/85 sm:text-sm">
              Sponsored message — pre-roll placement
            </p>
          </div>
        </div>
      </div>
      <div className="h-1 w-full bg-white/20">
        <div
          className="h-full bg-[oklch(0.72_0.2_12)] transition-[width] duration-1000 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Utility: interleave native ads into a list of items every N entries.
 * `minAds` guarantees a floor of ad slots (extra ads are appended at the end).
 */
export function interleaveAds<T>(items: T[], every: number, minAds = 0) {
  const out: Array<{ type: "item"; item: T } | { type: "ad"; key: string }> = [];
  let ads = 0;
  items.forEach((item, i) => {
    out.push({ type: "item", item });
    if ((i + 1) % every === 0 && i + 1 < items.length) {
      out.push({ type: "ad", key: `ad-${i + 1}` });
      ads += 1;
    }
  });
  if (items.length > 0) {
    while (ads < minAds) {
      ads += 1;
      out.push({ type: "ad", key: `ad-tail-${ads}` });
    }
  }
  return out;
}

