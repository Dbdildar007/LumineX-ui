import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchFile } from "@ffmpeg/util";
import JSZip from "jszip";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileVideo,
  FolderOpen,
  Info,
  Loader2,
  ShieldAlert,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  getFFmpeg,
  isCrossOriginIsolated,
  sanitizeName,
  supportsFileSystemAccess,
} from "@/lib/ffmpeg-client";

type Phase = "idle" | "loading" | "analyzing" | "splitting" | "saving" | "done" | "error";

interface ChunkInfo {
  name: string;
  size: number;
}

interface Result {
  videoName: string;
  folderName: string;
  chunks: ChunkInfo[];
  totalSeconds: number;
  method: "filesystem" | "zip";
  zipBlob?: Blob;
  zipName?: string;
}

const ACCEPTED = ["video/mp4", "video/quicktime", "video/x-matroska", "video/x-msvideo", "video/webm"];
const ACCEPT_EXT = ".mp4,.mkv,.mov,.avi,.webm";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s}s`;
}

export function VideoSplitter() {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [statusText, setStatusText] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [isolated, setIsolated] = useState(true);
  const [fsSupported, setFsSupported] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsolated(isCrossOriginIsolated());
    setFsSupported(supportsFileSystemAccess());
  }, []);

  const reset = useCallback(() => {
    setFile(null);
    setPhase("idle");
    setStatusText("");
    setProgress(0);
    setError(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const handleSelect = (f: File | null | undefined) => {
    if (!f) return;
    const okType = ACCEPTED.includes(f.type) || /\.(mp4|mkv|mov|avi|webm)$/i.test(f.name);
    if (!okType) {
      toast.error("Unsupported file type. Use MP4, MKV, MOV, AVI, or WEBM.");
      return;
    }
    setFile(f);
    setError(null);
    setResult(null);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleSelect(e.dataTransfer.files?.[0]);
  };

  const processVideo = async () => {
    if (!file) return;
    const startedAt = performance.now();
    const videoName = sanitizeName(file.name);
    setError(null);
    setResult(null);
    setProgress(0);

    try {
      setPhase("loading");
      setStatusText("Loading FFmpeg core (≈30MB, first time only)...");
      setProgress(2);
      const ffmpeg = await getFFmpeg(
        (msg) => {
          // Surface latest ffmpeg log so users see real progress
          if (msg && msg.length < 200) setStatusText(msg);
        },
        (ratio) => {
          if (ratio > 0 && ratio <= 1) {
            // Map ffmpeg exec progress into the 10-85 range during splitting
            setProgress(10 + Math.round(ratio * 75));
          }
        },
      );

      setPhase("analyzing");
      setStatusText("Reading video file...");
      setProgress(5);

      const inputName = `input.${(file.name.split(".").pop() || "mp4").toLowerCase()}`;
      const data = await fetchFile(file);
      await ffmpeg.writeFile(inputName, data);

      setPhase("splitting");
      setStatusText("Extracting 30-second chunks (lossless stream copy)...");
      setProgress(10);

      const outputPattern = `${videoName}_chunk_%03d.mp4`;
      await ffmpeg.exec([
        "-i",
        inputName,
        "-c",
        "copy",
        "-map",
        "0",
        "-f",
        "segment",
        "-segment_time",
        "30",
        "-reset_timestamps",
        "1",
        outputPattern,
      ]);

      setStatusText("Collecting generated chunks...");
      setProgress(85);

      const list = await ffmpeg.listDir("/");
      const chunkNames = list
        .filter((e) => !e.isDir && e.name.startsWith(`${videoName}_chunk_`) && e.name.endsWith(".mp4"))
        .map((e) => e.name)
        .sort();

      if (chunkNames.length === 0) {
        throw new Error("No chunks were produced. The file may be unsupported or corrupted.");
      }

      const chunks: { name: string; data: Uint8Array; size: number }[] = [];
      for (const name of chunkNames) {
        const out = (await ffmpeg.readFile(name)) as Uint8Array;
        chunks.push({ name, data: out, size: out.byteLength });
        await ffmpeg.deleteFile(name);
      }
      await ffmpeg.deleteFile(inputName);

      setPhase("saving");
      setProgress(90);

      let method: "filesystem" | "zip" = "zip";
      let zipBlob: Blob | undefined;
      let zipName: string | undefined;

      if (supportsFileSystemAccess()) {
        try {
          setStatusText("Choose a folder to save chunks...");
          // @ts-expect-error showDirectoryPicker is non-standard
          const rootHandle = await window.showDirectoryPicker({ mode: "readwrite" });
          const folderHandle = await rootHandle.getDirectoryHandle(videoName, { create: true });
          setStatusText("Writing chunks to local storage...");
          let i = 0;
          for (const c of chunks) {
            const fh = await folderHandle.getFileHandle(c.name, { create: true });
            const writable = await fh.createWritable();
            await writable.write(c.data);
            await writable.close();
            i++;
            setProgress(90 + Math.round((i / chunks.length) * 10));
          }
          method = "filesystem";
        } catch (err) {
          const e = err as DOMException;
          if (e?.name === "AbortError") {
            setStatusText("Save cancelled. Falling back to ZIP download...");
          } else {
            console.error(err);
            setStatusText("Folder save failed. Falling back to ZIP download...");
          }
        }
      }

      if (method === "zip") {
        setStatusText("Packaging chunks into ZIP archive...");
        const zip = new JSZip();
        const folder = zip.folder(videoName)!;
        for (const c of chunks) {
          folder.file(c.name, c.data);
        }
        zipBlob = await zip.generateAsync({ type: "blob" }, (meta) => {
          setProgress(90 + Math.round((meta.percent / 100) * 10));
        });
        zipName = `${videoName}_chunks.zip`;
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = zipName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }

      const elapsed = (performance.now() - startedAt) / 1000;
      setResult({
        videoName,
        folderName: videoName,
        chunks: chunks.map((c) => ({ name: c.name, size: c.size })),
        totalSeconds: elapsed,
        method,
        zipBlob,
        zipName,
      });
      setPhase("done");
      setStatusText("Complete");
      setProgress(100);
      toast.success(`Generated ${chunks.length} chunks in ${formatTime(elapsed)}`);
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      const memoryHint = /memory|allocat|out of bounds|RuntimeError/i.test(msg)
        ? " The file may exceed browser WebAssembly memory limits (typically ~2-4 GB). Try a smaller file."
        : "";
      setError(msg + memoryHint);
      setPhase("error");
    }
  };

  const downloadAgain = () => {
    if (!result?.zipBlob || !result.zipName) return;
    const url = URL.createObjectURL(result.zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.zipName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const isProcessing = useMemo(
    () => ["loading", "analyzing", "splitting", "saving"].includes(phase),
    [phase],
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:py-12">
      <header className="space-y-2 text-center">
        <Badge variant="secondary" className="mx-auto">Lossless · Client-side · WebAssembly</Badge>
        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
          Video <span className="text-primary">Splitter</span>
        </h1>
        <p className="mx-auto max-w-2xl text-sm text-muted-foreground sm:text-base">
          Split any video into exact 30-second chunks — entirely in your browser, with zero
          re-encoding and zero quality loss.
        </p>
      </header>

      {!isolated && <IsolationNotice />}

      <DropZone
        file={file}
        dragOver={dragOver}
        disabled={isProcessing}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onClear={reset}
      />
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_EXT}
        className="hidden"
        onChange={(e) => handleSelect(e.target.files?.[0])}
      />

      {file && phase === "idle" && (
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button size="lg" onClick={processVideo} className="w-full sm:w-auto">
            Split into 30s chunks
          </Button>
          <Button size="lg" variant="outline" onClick={reset} className="w-full sm:w-auto">
            Choose another file
          </Button>
        </div>
      )}

      {isProcessing && (
        <Card className="space-y-4 p-6">
          <div className="flex items-center gap-3">
            <Loader2 className="size-5 animate-spin text-primary" />
            <p className="text-sm font-medium">{statusText}</p>
          </div>
          <Progress value={progress} />
          <p className="text-right text-xs text-muted-foreground">{progress}%</p>
        </Card>
      )}

      {phase === "error" && error && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Processing failed</AlertTitle>
          <AlertDescription className="mt-2 space-y-3">
            <p className="break-words text-sm">{error}</p>
            <Button size="sm" variant="outline" onClick={reset}>Try again</Button>
          </AlertDescription>
        </Alert>
      )}

      {phase === "done" && result && (
        <CompletionCard result={result} onReset={reset} onDownloadAgain={downloadAgain} />
      )}

      <InfoBanners fsSupported={fsSupported} />
    </div>
  );
}

function DropZone(props: {
  file: File | null;
  dragOver: boolean;
  disabled: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onClick: () => void;
  onClear: () => void;
}) {
  const { file, dragOver, disabled, onDragOver, onDragLeave, onDrop, onClick, onClear } = props;

  if (file) {
    return (
      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
            <FileVideo className="size-6" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatBytes(file.size)} · {file.type || "video"}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClear} disabled={disabled}>
          <X className="size-4" /> Remove
        </Button>
      </Card>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      disabled={disabled}
      className={cn(
        "flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-card/50 px-6 py-12 text-center transition-colors hover:border-primary/60 hover:bg-card sm:py-16",
        dragOver && "border-primary bg-primary/5",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <div className="grid size-14 place-items-center rounded-full bg-primary/15 text-primary">
        <Upload className="size-7" />
      </div>
      <div>
        <p className="text-base font-semibold sm:text-lg">Drop your video here or tap to browse</p>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
          MP4 · MKV · MOV · AVI · WEBM — processed entirely on your device
        </p>
      </div>
    </button>
  );
}

function CompletionCard({
  result,
  onReset,
  onDownloadAgain,
}: {
  result: Result;
  onReset: () => void;
  onDownloadAgain: () => void;
}) {
  return (
    <Card className="space-y-5 p-6">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="size-6 shrink-0 text-primary" />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold sm:text-xl">Split complete</h2>
          <p className="text-sm text-muted-foreground">
            {result.chunks.length} chunks generated in {formatTime(result.totalSeconds)} ·{" "}
            {result.method === "filesystem" ? "Saved to your chosen folder" : "Downloaded as ZIP"}
          </p>
        </div>
      </div>

      <div className="rounded-lg bg-muted/50 p-4 font-mono text-xs sm:text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <FolderOpen className="size-4" /> {result.folderName}/
        </div>
        <ul className="mt-2 space-y-0.5 pl-6">
          {result.chunks.slice(0, 8).map((c) => (
            <li key={c.name} className="flex justify-between gap-2 truncate">
              <span className="truncate">{c.name}</span>
              <span className="shrink-0 text-muted-foreground">{formatBytes(c.size)}</span>
            </li>
          ))}
          {result.chunks.length > 8 && (
            <li className="text-muted-foreground">…and {result.chunks.length - 8} more</li>
          )}
        </ul>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        {result.method === "zip" && result.zipBlob && (
          <Button onClick={onDownloadAgain} variant="outline" className="w-full sm:w-auto">
            <Download className="size-4" /> Download ZIP again
          </Button>
        )}
        <Button onClick={onReset} className="w-full sm:w-auto">Split another video</Button>
      </div>
    </Card>
  );
}

function IsolationNotice() {
  return (
    <Alert>
      <ShieldAlert className="size-4" />
      <AlertTitle>Single-threaded mode</AlertTitle>
      <AlertDescription className="mt-2 space-y-2">
        <p className="text-sm">
          This page isn't cross-origin isolated, so FFmpeg will run in single-threaded mode.
          Splitting still works — large files may simply take longer.
        </p>
        <HeadersDialog />
      </AlertDescription>
    </Alert>
  );
}


function HeadersDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">How to enable COOP/COEP</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enable COOP / COEP headers</DialogTitle>
          <DialogDescription>
            FFmpeg.wasm needs SharedArrayBuffer, which requires these response headers:
          </DialogDescription>
        </DialogHeader>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp`}
        </pre>
        <div className="space-y-3 text-sm">
          <div>
            <p className="font-semibold">Netlify — <code>netlify.toml</code></p>
            <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`[[headers]]
  for = "/*"
  [headers.values]
    Cross-Origin-Opener-Policy = "same-origin"
    Cross-Origin-Embedder-Policy = "require-corp"`}
            </pre>
          </div>
          <div>
            <p className="font-semibold">Vercel — <code>vercel.json</code></p>
            <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`{
  "headers": [{
    "source": "/(.*)",
    "headers": [
      { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
      { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
    ]
  }]
}`}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoBanners({ fsSupported }: { fsSupported: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Alert>
        <Info className="size-4" />
        <AlertTitle>Keyframe limitation</AlertTitle>
        <AlertDescription className="text-xs">
          Lossless stream copy splits at the nearest I-frame (keyframe), so chunk lengths may vary
          by a few milliseconds from exactly 30.00s.
        </AlertDescription>
      </Alert>
      <Alert>
        <Info className="size-4" />
        <AlertTitle>{fsSupported ? "Saving to a folder" : "Mobile: ZIP download"}</AlertTitle>
        <AlertDescription className="text-xs">
          {fsSupported
            ? "On desktop browsers, you'll be prompted to pick a folder. Chunks are written into a subfolder named after your video."
            : "Your browser doesn't support folder writes. Chunks will be bundled into a single ZIP file and downloaded automatically."}
        </AlertDescription>
      </Alert>
    </div>
  );
}
