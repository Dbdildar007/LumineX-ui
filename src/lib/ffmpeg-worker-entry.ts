// Worker entry that Vite will bundle. Re-exports the FFmpeg worker handlers,
// resolving all relative imports at build time so it can run from a module Worker.
import "@ffmpeg/ffmpeg/dist/esm/worker.js";
