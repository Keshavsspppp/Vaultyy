"use client";

import { useEffect, useState } from "react";
import { X, Download, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useDrive } from "@/components/drive/DriveContext";
import { AskAiPanel } from "@/components/drive/AskAiPanel";
import { Modal } from "@/components/ui/Modal";
import { FileIcon } from "@/components/drive/FileIcon";
import { formatBytes, previewKind } from "@/lib/format";
import type { NodeDTO } from "@/lib/nodes";

type Props = {
  node: NodeDTO | null;
  siblings: NodeDTO[]; // previewable files in the current view, for prev/next
  linkToken?: string | null;
  onClose: () => void;
  onNavigate: (n: NodeDTO) => void;
  /** Open with the Ask AI panel already expanded. */
  initialAi?: boolean;
};

export function fileUrl(node: NodeDTO, inline: boolean, linkToken?: string | null) {
  const q = new URLSearchParams();
  if (inline) q.set("inline", "1");
  if (linkToken) q.set("token", linkToken);
  const qs = q.toString();
  return `/api/nodes/${node.id}/download${qs ? `?${qs}` : ""}`;
}

export function PreviewModal({ node, siblings, linkToken, onClose, onNavigate, initialAi = false }: Props) {
  const { aiEnabled } = useDrive();
  const [ai, setAi] = useState(initialAi);
  // Re-open the panel when a different file is opened with initialAi set.
  const [prevInit, setPrevInit] = useState(initialAi);
  if (initialAi !== prevInit) {
    setPrevInit(initialAi);
    setAi(initialAi);
  }
  const idx = node ? siblings.findIndex((s) => s.id === node.id) : -1;
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  useEffect(() => {
    if (!node) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && prev) onNavigate(prev);
      if (e.key === "ArrowRight" && next) onNavigate(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [node, prev, next, onNavigate]);

  if (!node) return null;
  const kind = previewKind(node.mimeType, node.name);
  const src = fileUrl(node, true, linkToken);

  return (
    <Modal open onClose={onClose} bare>
      <div className="fixed inset-0 flex flex-col" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <header className="flex items-center gap-3 px-4 py-3 text-background">
          <button onClick={onClose} className="rounded-md p-2 hover:bg-white/10" aria-label="Close preview">
            <X size={22} />
          </button>
          <FileIcon type="FILE" mimeType={node.mimeType} name={node.name} size={22} />
          <span className="flex-1 truncate text-sm">{node.name}</span>
          {aiEnabled && !linkToken && (
            <button
              onClick={() => setAi((a) => !a)}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ${ai ? "bg-background text-foreground" : "bg-white/10 hover:bg-white/20"}`}
              aria-pressed={ai}
            >
              <Sparkles size={16} /> Ask AI
            </button>
          )}
          <a
            href={fileUrl(node, false, linkToken)}
            className="rounded-md p-2 hover:bg-white/10"
            aria-label="Download"
            title="Download"
          >
            <Download size={22} />
          </a>
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="relative flex min-w-0 flex-1 items-center justify-center px-16 pb-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            {prev && (
              <NavButton side="left" onClick={() => onNavigate(prev)}>
                <ChevronLeft size={28} />
              </NavButton>
            )}
            <Body node={node} kind={kind} src={src} />
            {next && (
              <NavButton side="right" onClick={() => onNavigate(next)}>
                <ChevronRight size={28} />
              </NavButton>
            )}
          </div>
          {ai && aiEnabled && !linkToken && <AskAiPanel key={node.id} node={node} onClose={() => setAi(false)} />}
        </div>
      </div>
    </Modal>
  );
}

function NavButton({ side, onClick, children }: { side: "left" | "right"; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`absolute top-1/2 -translate-y-1/2 ${side === "left" ? "left-4" : "right-4"} rounded-md bg-white/10 p-2 text-background hover:bg-white/20`}
      aria-label={side === "left" ? "Previous" : "Next"}
    >
      {children}
    </button>
  );
}

function Body({ node, kind, src }: { node: NodeDTO; kind: ReturnType<typeof previewKind>; src: string }) {
  switch (kind) {
    case "image":
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={src} alt={node.name} className="max-h-full max-w-full rounded-md object-contain shadow-2xl" />;
    case "video":
      return <video src={src} controls autoPlay className="max-h-full max-w-full rounded shadow-2xl" />;
    case "audio":
      return (
        <div className="flex flex-col items-center gap-6 text-background">
          <FileIcon type="FILE" mimeType={node.mimeType} name={node.name} size={96} />
          <audio src={src} controls autoPlay />
        </div>
      );
    case "pdf":
      return <iframe src={src} title={node.name} className="h-full w-full max-w-5xl rounded bg-white shadow-2xl" />;
    case "text":
      return <TextBody src={src} />;
    default:
      return (
        <div className="flex flex-col items-center gap-4 text-background">
          <FileIcon type="FILE" mimeType={node.mimeType} name={node.name} size={96} />
          <p className="text-sm text-background/70">No preview available · {formatBytes(node.size)}</p>
          <a href={src.replace("inline=1", "")} className="rounded-md bg-white/15 px-5 py-2 text-sm hover:bg-white/25">
            Download
          </a>
        </div>
      );
  }
}

function TextBody({ src }: { src: string }) {
  const [loaded, setLoaded] = useState<{ src: string; text: string } | null>(null);
  const text = loaded?.src === src ? loaded.text : null; // null = loading
  useEffect(() => {
    let cancelled = false;
    fetch(src)
      .then((r) => r.text())
      .then((t) => !cancelled && setLoaded({ src, text: t.length > 200_000 ? t.slice(0, 200_000) + "\n\n… (truncated)" : t }))
      .catch(() => !cancelled && setLoaded({ src, text: "Could not load file." }));
    return () => {
      cancelled = true;
    };
  }, [src]);
  return (
    <pre className="h-full w-full max-w-5xl overflow-auto rounded-md bg-surface p-6 font-mono text-sm text-foreground shadow-2xl whitespace-pre-wrap">
      {text ?? "Loading…"}
    </pre>
  );
}
