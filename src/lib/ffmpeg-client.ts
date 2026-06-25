import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
// Vite bundles the worker module and gives us a URL we can pass to FFmpeg.
// This resolves the worker's relative imports at build time so it can run
// from a module Worker without "Failed to fetch module" errors.
import ffmpegWorkerURL from "./ffmpeg-worker-entry.ts?worker&url";

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

const CORE_VERSION = "0.12.10";
// ESM core (with default export) works with module workers; UMD core needs
// importScripts which module workers lack. 0.12.6 ESM lacks the default
// export — 0.12.10+ ships it.
const CORE_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

export async function getFFmpeg(
  onLog?: (msg: string) => void,
  onProgress?: (ratio: number) => void,
): Promise<FFmpeg> {
  if (ffmpegInstance) {
    if (onLog) ffmpegInstance.on("log", ({ message }) => onLog(message));
    if (onProgress) ffmpegInstance.on("progress", ({ progress }) => onProgress(progress));
    return ffmpegInstance;
  }
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const ffmpeg = new FFmpeg();
      ffmpeg.on("log", ({ message }) => {
        // eslint-disable-next-line no-console
        console.debug("[ffmpeg]", message);
        onLog?.(message);
      });
      if (onProgress) ffmpeg.on("progress", ({ progress }) => onProgress(progress));

      const [coreURL, wasmURL] = await Promise.all([
        toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
        toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
      ]);

      await ffmpeg.load({ coreURL, wasmURL, classWorkerURL: ffmpegWorkerURL });
      ffmpegInstance = ffmpeg;
      return ffmpeg;
    } catch (e) {
      loadPromise = null;
      ffmpegInstance = null;
      throw e;
    }
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
