import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { VideoItem } from "@/lib/media";
import { PauseAdOverlay, PreRollOverlay } from "@/components/ads/AdSlots";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const HOLD_SPEED = 2;
const CONTROLS_HIDE_MS = 5000;
const HOLD_THRESHOLD_MS = 400;
const DOUBLE_TAP_MS = 300;
const MOVE_CANCEL_PX = 12;
const VIEW_QUALIFY_SECONDS = 5;

function formatTime(t: number) {
  if (!Number.isFinite(t) || t < 0) return "0:00";
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return h > 0 ? `${h}:${mm}:${String(s).padStart(2, "0")}` : `${mm}:${String(s).padStart(2, "0")}`;
}

interface VideoPlayerProps {
  video: VideoItem;
  autoPlay?: boolean;
  /** Fires once, after 5 seconds of actual playback — used to count a view. */
  onViewQualified?: (video: VideoItem) => void;
  onEnded?: () => void;
  className?: string;
  /** Pre-roll ad length in seconds (0 disables). */
  preRollSeconds?: number;
  /** Show a large pause ad when the viewer pauses. */
  pauseAd?: boolean;
}

/**
 * Glass / 3D custom player.
 * Centre: play-pause only. Bottom: progress bar + one row with speed, mute,
 * elapsed/total and fullscreen. Mobile: double-tap sides to seek ±10s,
 * hold for 2x, fullscreen rotates to landscape.
 */
function VideoPlayerImpl({
  video,
  autoPlay = true,
  onViewQualified,
  onEnded,
  className,
  preRollSeconds = 12,
  pauseAd = true,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);

  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [holding, setHolding] = useState(false);
  const [skipFlash, setSkipFlash] = useState<"left" | "right" | null>(null);
  const [adRemaining, setAdRemaining] = useState(preRollSeconds);
  const [pauseAdDismissed, setPauseAdDismissed] = useState(false);
  const adActive = adRemaining > 0;

  const seekingRef = useRef(false);
  const watchedRef = useRef(0);
  const countedRef = useRef(false);
  const lastTickRef = useRef(0);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preHoldSpeed = useRef(1);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const wasHold = useRef(false);
  const lastTap = useRef<{ zone: "left" | "right"; time: number } | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speedMenuOpenRef = useRef(false);
  speedMenuOpenRef.current = speedMenuOpen;
  const adActiveRef = useRef(adActive);
  adActiveRef.current = adActive;

  // ---------------------------------------------------------------- controls
  const scheduleHide = useCallback(() => {
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => {
      if (!speedMenuOpenRef.current) setShowControls(false);
    }, CONTROLS_HIDE_MS);
  }, []);

  const wake = useCallback(() => {
    setShowControls(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    wake();
    return () => {
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
      if (tapTimer.current) clearTimeout(tapTimer.current);
      if (skipFlashTimer.current) clearTimeout(skipFlashTimer.current);
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, [wake, video.id]);

  // ------------------------------------------------------------ media wiring
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    watchedRef.current = 0;
    countedRef.current = false;
    lastTickRef.current = 0;
    setCurrentTime(0);
    setDuration(0);
    setBuffering(true);
    setPlaying(false);

    const onLoadedMeta = () => setDuration(v.duration || 0);
    const onTimeUpdate = () => {
      if (!seekingRef.current) setCurrentTime(v.currentTime);
      // Count 5s of real playback (ignores seeks) before registering a view.
      const last = lastTickRef.current;
      const delta = v.currentTime - last;
      lastTickRef.current = v.currentTime;
      if (delta > 0 && delta < 1.5 && !v.paused) watchedRef.current += delta;
      if (!countedRef.current && watchedRef.current >= VIEW_QUALIFY_SECONDS) {
        countedRef.current = true;
        onViewQualified?.(video);
      }
    };
    const onProgress = () => {
      if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1));
    };
    const onWaiting = () => setBuffering(true);
    const onPlayingEv = () => {
      setBuffering(false);
      setPlaying(true);
      setPauseAdDismissed(false);
      lastTickRef.current = v.currentTime;
    };
    const onPause = () => setPlaying(false);
    const onCanPlay = () => setBuffering(false);
    const onSeeking = () => setBuffering(true);
    const onSeeked = () => {
      lastTickRef.current = v.currentTime;
      setBuffering(false);
    };

    const onEnd = () => {
      setPlaying(false);
      onEnded?.();
    };

    v.addEventListener("loadedmetadata", onLoadedMeta);
    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("progress", onProgress);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("playing", onPlayingEv);
    v.addEventListener("pause", onPause);
    v.addEventListener("canplay", onCanPlay);
    v.addEventListener("seeking", onSeeking);
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("ended", onEnd);

    if (autoPlay && !adActiveRef.current) v.play().catch(() => { });

    return () => {
      v.removeEventListener("loadedmetadata", onLoadedMeta);
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("progress", onProgress);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("playing", onPlayingEv);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("seeking", onSeeking);
      v.removeEventListener("seeked", onSeeked);
      v.removeEventListener("ended", onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id, autoPlay]);

  // ------------------------------------------------------------- pre-roll ad
  useEffect(() => {
    setAdRemaining(preRollSeconds);
    setPauseAdDismissed(false);
  }, [video.id, preRollSeconds]);

  useEffect(() => {
    if (!adActive) return;
    const v = videoRef.current;
    v?.pause();
    setShowControls(false);
    const id = setInterval(() => setAdRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [adActive, video.id]);

  const finishAd = useCallback(() => {
    setAdRemaining(0);
    setShowControls(true);
    if (autoPlay) videoRef.current?.play().catch(() => { });
  }, [autoPlay]);

  // ------------------------------------------------- fullscreen + orientation
  useEffect(() => {
    const onFsChange = () => {
      const active = !!document.fullscreenElement && document.fullscreenElement === containerRef.current;
      setIsFullscreen(active);
      const orientation = (screen as any).orientation;
      if (active) orientation?.lock?.("landscape").catch(() => { });
      else {
        orientation?.unlock?.();
        // Exiting fullscreen can leave the page scrolled away from the player.
        // Bring the player back into view so playback stays visible.
        const el = containerRef.current;
        if (el) {
          requestAnimationFrame(() => {
            setTimeout(() => {
              el.scrollIntoView({ block: "center", behavior: "smooth" });
            }, 60);
          });
        }
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);


  const toggleFullscreen = useCallback((e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    const container = containerRef.current;
    const v = videoRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => { });
      return;
    }
    if (container.requestFullscreen) {
      container.requestFullscreen().catch(() => {
        (v as any)?.webkitEnterFullscreen?.();
      });
    } else {
      // iOS Safari: native video fullscreen auto-rotates with the device.
      (v as any)?.webkitEnterFullscreen?.();
    }
  }, []);

  // ------------------------------------------------------------------ actions
  const togglePlay = useCallback(
    (e?: React.SyntheticEvent) => {
      e?.stopPropagation();
      const v = videoRef.current;
      if (!v) return;
      if (v.paused) v.play().catch(() => { });
      else v.pause();
      wake();
    },
    [wake],
  );

  const skip = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    v.currentTime = Math.min(Math.max(0, v.currentTime + delta), v.duration || 0);
    setCurrentTime(v.currentTime);
  }, []);

  const flashSkip = (zone: "left" | "right") => {
    setSkipFlash(zone);
    if (skipFlashTimer.current) clearTimeout(skipFlashTimer.current);
    skipFlashTimer.current = setTimeout(() => setSkipFlash(null), 480);
  };

  const changeSpeed = (s: number) => {
    setSpeed(s);
    if (videoRef.current) videoRef.current.playbackRate = s;
    setSpeedMenuOpen(false);
    wake();
  };

  const toggleMute = useCallback(
    (e?: React.SyntheticEvent) => {
      e?.stopPropagation();
      const v = videoRef.current;
      if (!v) return;
      const next = !v.muted;
      v.muted = next;
      if (!next && v.volume === 0) v.volume = 1;
      setMuted(next);
      wake();
    },
    [wake],
  );

  // --------------------------------------------------------------- seek bar
  const seekFromClientX = useCallback(
    (clientX: number) => {
      const el = progressRef.current;
      const v = videoRef.current;
      if (!el || !v || !duration) return;
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const t = ratio * duration;
      setCurrentTime(t);
      v.currentTime = t;
    },
    [duration],
  );

  // --------------------------------------------------------------- gestures
  const onGesturePointerDown = (e: React.PointerEvent) => {
    if (adActive) return;
    if ((e.target as HTMLElement).closest("[data-control]")) return;
    pointerStart.current = { x: e.clientX, y: e.clientY };
    wasHold.current = false;
    holdTimer.current = setTimeout(() => {
      wasHold.current = true;
      const v = videoRef.current;
      if (v) {
        preHoldSpeed.current = v.playbackRate;
        v.playbackRate = HOLD_SPEED;
      }
      setHolding(true);
    }, HOLD_THRESHOLD_MS);
  };

  const onGesturePointerMove = (e: React.PointerEvent) => {
    const start = pointerStart.current;
    if (!start) return;
    if (
      (Math.abs(e.clientX - start.x) > MOVE_CANCEL_PX ||
        Math.abs(e.clientY - start.y) > MOVE_CANCEL_PX) &&
      holdTimer.current
    ) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const endHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (holding) {
      setHolding(false);
      if (videoRef.current) videoRef.current.playbackRate = preHoldSpeed.current;
    }
  };

  const toggleControls = () => {
    setShowControls((s) => {
      if (s) return false;
      scheduleHide();
      return true;
    });
  };

  const onGesturePointerUp = (e: React.PointerEvent) => {
    if (adActive) return;
    if ((e.target as HTMLElement).closest("[data-control]")) return;
    const start = pointerStart.current;
    pointerStart.current = null;
    const held = wasHold.current;
    wasHold.current = false;
    endHold();
    if (held || !start) return;
    if (speedMenuOpen) {
      setSpeedMenuOpen(false);
      return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relX = (e.clientX - rect.left) / rect.width;
    const isTouch = e.pointerType !== "mouse";
    const zone: "left" | "right" | "center" = relX < 0.35 ? "left" : relX > 0.65 ? "right" : "center";

    if (isTouch && zone !== "center") {
      const now = Date.now();
      const last = lastTap.current;
      if (last && last.zone === zone && now - last.time < DOUBLE_TAP_MS) {
        if (tapTimer.current) clearTimeout(tapTimer.current);
        lastTap.current = null;
        skip(zone === "right" ? 10 : -10);
        flashSkip(zone);
        return;
      }
      lastTap.current = { zone, time: now };
      if (tapTimer.current) clearTimeout(tapTimer.current);
      tapTimer.current = setTimeout(() => {
        lastTap.current = null;
        toggleControls();
      }, DOUBLE_TAP_MS);
      return;
    }

    toggleControls();
  };

  const progressPct = duration ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={`group/player relative w-full select-none overflow-hidden bg-black shadow-[0_24px_60px_-28px_rgba(20,10,40,0.75)] [perspective:1400px] ${isFullscreen
        ? "rounded-none"
        : "rounded-xl border border-white/25 sm:rounded-2xl"
        } ${className ?? ""}`}
      style={{ aspectRatio: isFullscreen ? undefined : "16 / 9", height: isFullscreen ? "100%" : undefined }}
      onPointerDown={onGesturePointerDown}
      onPointerMove={onGesturePointerMove}
      onPointerUp={onGesturePointerUp}
      onPointerLeave={endHold}
      onPointerCancel={endHold}
    >
      <video
        ref={videoRef}
        src={video.videoUrl}
        poster={video.poster}
        playsInline
        preload="metadata"
        className="absolute inset-0 h-full w-full bg-black object-contain"
      />

      {/* Hold-to-2x pill */}
      {holding && (
        <div className="pointer-events-none absolute left-1/2 top-5 z-30 -translate-x-1/2 rounded-full border border-white/30 bg-white/15 px-3 py-1 text-[11px] font-black text-white backdrop-blur-xl">
          2x speed
        </div>
      )}

      {/* Double-tap seek flash */}
      {skipFlash && (
        <div
          className={`pointer-events-none absolute top-0 z-30 flex h-full w-1/2 items-center justify-center ${skipFlash === "left" ? "left-0" : "right-0"
            }`}
        >
          <div className="flex flex-col items-center gap-1 rounded-full border border-white/25 bg-white/15 px-5 py-4 text-white backdrop-blur-xl animate-in fade-in zoom-in duration-200">
            {skipFlash === "left" ? <RotateCcw className="h-6 w-6" /> : <RotateCw className="h-6 w-6" />}
            <span className="text-[11px] font-black">10s</span>
          </div>
        </div>
      )}

      {buffering && !adActive && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
          <Loader2 className="h-10 w-10 animate-spin text-white/80 drop-shadow-[0_0_14px_rgba(255,255,255,0.5)]" />
        </div>
      )}

      {/* Centre: play / pause only — white glass */}
      <div
        className={`absolute inset-0 z-20 grid place-items-center transition-all duration-300 ${showControls && !adActive ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
      >
        <button
          type="button"
          data-control
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
          className="
grid h-[52px] w-[52px]
place-items-center
rounded-full

border-0
bg-transparent
shadow-none
backdrop-blur-none

sm:border sm:border-white/50
sm:bg-white/20
sm:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.7),inset_0_2px_10px_rgba(255,255,255,0.55)]
sm:backdrop-blur-2xl

text-white
transition duration-200
hover:bg-white/30
active:scale-90
"
        >
          {playing ? (
            <Pause className="h-5 w-5 fill-current drop-shadow" />
          ) : (
            <Play className="h-5 w-5 fill-current pl-0.5" />
          )}
        </button>
      </div>




      {/* Pause ad */}
      {pauseAd && !adActive && !playing && !buffering && currentTime > 0 && !pauseAdDismissed && (
        <PauseAdOverlay onClose={() => setPauseAdDismissed(true)} />
      )}

      {/* Bottom glass bar */}
      <div
        className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-2.5 pb-2 pt-8 transition-opacity duration-300 sm:px-3 ${showControls && !adActive ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
      >
        {/* Seek bar */}
        <div
          ref={progressRef}
          data-control
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={currentTime}
          tabIndex={0}
          className="group/bar relative mb-2 h-4 w-full cursor-pointer touch-none"
          onPointerDown={(e) => {
            e.stopPropagation();
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            seekingRef.current = true;
            seekFromClientX(e.clientX);
            wake();
          }}
          onPointerMove={(e) => {
            e.stopPropagation();
            if (seekingRef.current) seekFromClientX(e.clientX);
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            seekingRef.current = false;
          }}
          onPointerCancel={() => {
            seekingRef.current = false;
          }}
        >
          <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-white/20 backdrop-blur" />
          <div
            className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/35"
            style={{ width: `${bufferedPct}%` }}
          />
          <div
            className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-white
shadow-[0_0_8px_rgba(255,255,255,0.8)]"
            style={{ width: `${progressPct}%` }}
          />
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 bg-white shadow-[0_0_0_5px_rgba(255,45,80,0.28)] transition-transform group-hover/bar:scale-110"
            style={{ left: `${progressPct}%` }}
          />
        </div>

        {/* One row: speed · mute · time · fullscreen */}
        <div className="flex items-center gap-2 text-white">
          <div className="relative">
            <button
              type="button"
              data-control
              onClick={(e) => {
                e.stopPropagation();
                setSpeedMenuOpen((s) => !s);
                wake();
              }}
              aria-label="Playback speed"
              className="
flex h-6 items-center gap-1 rounded-full
border-0
bg-transparent
shadow-none
backdrop-blur-none

sm:border
sm:border-white/25
sm:bg-white/15
sm:backdrop-blur-xl

px-2 text-[10px] font-black
transition active:scale-95
"
            >
              {speed}x
            </button>
            {speedMenuOpen && (
              <div
                data-control
                className="absolute bottom-full left-0 z-40 mb-2 w-20 overflow-hidden rounded-xl border border-white/20 bg-black/70 py-1 text-center backdrop-blur-2xl"
              >
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      changeSpeed(s);
                    }}
                    className={`block w-full px-3 py-1.5 text-xs font-bold transition hover:bg-white/20 ${s === speed ? "text-[oklch(0.72_0.2_12)]" : "text-white"
                      }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            data-control
            onClick={(e) => {
              e.stopPropagation();
              skip(-10);
              flashSkip("left");
              wake();
            }}
            aria-label="Rewind 10 seconds"
            className="hidden h-7 w-7 place-items-center rounded-full border border-white/25 bg-white/15 backdrop-blur-xl transition hover:bg-white/25 active:scale-95 sm:grid"
          >
            <RotateCcw className="h-[15px] w-[15px]" />
          </button>

          <button
            type="button"
            data-control
            onClick={(e) => {
              e.stopPropagation();
              skip(10);
              flashSkip("right");
              wake();
            }}
            aria-label="Forward 10 seconds"
            className="hidden h-7 w-7 place-items-center rounded-full border border-white/25 bg-white/15 backdrop-blur-xl transition hover:bg-white/25 active:scale-95 sm:grid"
          >
            <RotateCw className="h-[15px] w-[15px]" />
          </button>

          <button
            type="button"
            data-control
            onClick={toggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            className="
grid h-7 w-7 place-items-center rounded-full

border-0
bg-transparent
shadow-none
backdrop-blur-none

sm:border
sm:border-white/25
sm:bg-white/15
sm:backdrop-blur-xl

transition active:scale-95
"
          >
            {muted ? <VolumeX className="h-[15px] w-[15px]" /> : <Volume2 className="h-[15px] w-[15px]" />}
          </button>

          <span className="whitespace-nowrap text-[11px] font-bold tabular-nums text-white/90">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <button
            type="button"
            data-control
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className="ml-auto grid h-7 w-7 place-items-center rounded-full border border-white/25 bg-white/15 backdrop-blur-xl transition hover:bg-white/25 active:scale-95"
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Pre-roll ad — hides every control while it runs */}
      {adActive && (
        <PreRollOverlay
          remaining={adRemaining}
          total={preRollSeconds}
          canSkip={preRollSeconds - adRemaining >= 5}
          onSkip={finishAd}
        />
      )}
    </div>
  );
}

export const VideoPlayer = memo(VideoPlayerImpl);
