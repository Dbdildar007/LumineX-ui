import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

const CORE_VERSION = "0.12.6";
const FFMPEG_VERSION = "0.12.15";
// ESM core works with module workers (UMD requires importScripts which module workers lack)
const CORE_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`;
const WORKER_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/esm/worker.js`;

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

      const [coreURL, wasmURL, classWorkerURL] = await Promise.all([
        toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
        toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
        toBlobURL(WORKER_URL, "text/javascript"),
      ]);

      await ffmpeg.load({ coreURL, wasmURL, classWorkerURL });
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
