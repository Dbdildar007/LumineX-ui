import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

const CORE_VERSION = "0.12.6";
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

export async function getFFmpeg(
  onLog?: (msg: string) => void,
  onProgress?: (ratio: number) => void,
): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();
    if (onLog) ffmpeg.on("log", ({ message }) => onLog(message));
    if (onProgress) ffmpeg.on("progress", ({ progress }) => onProgress(progress));

    await ffmpeg.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return loadPromise;
}

export function isCrossOriginIsolated(): boolean {
  return typeof window !== "undefined" && window.crossOriginIsolated === true;
}

export function supportsFileSystemAccess(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export function sanitizeName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return base.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 80) || "video";
}
