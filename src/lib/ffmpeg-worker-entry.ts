// Worker entry that Vite will bundle. Importing the FFmpeg worker module
// here lets Vite resolve all its relative imports at build time so it can
// run inside a module Worker constructed from a URL.
// @ts-expect-error - worker module has no public types
import "@ffmpeg/ffmpeg/dist/esm/worker.js";
