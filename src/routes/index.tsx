import { createFileRoute } from "@tanstack/react-router";

import { VideoSplitter } from "@/components/VideoSplitter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Video Splitter — Lossless 30s Chunks in Your Browser" },
      {
        name: "description",
        content:
          "Split videos into exact 30-second chunks entirely in your browser. Lossless stream copy, zero re-encoding, MP4/MKV/MOV/AVI supported.",
      },
      { property: "og:title", content: "Video Splitter — Lossless 30s Chunks" },
      {
        property: "og:description",
        content: "Client-side video splitting with FFmpeg.wasm. No uploads, no quality loss.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <VideoSplitter />
    </main>
  );
}
