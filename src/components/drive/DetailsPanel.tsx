"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Sparkles, X } from "lucide-react";
import { useDrive } from "@/components/drive/DriveContext";
import { FileIcon } from "@/components/drive/FileIcon";
import { api } from "@/lib/client";
import { formatBytes } from "@/lib/format";
import { DateTimeText } from "@/components/ui/DateText";
import type { NodeDTO } from "@/lib/nodes";

const ROLE_LABEL = { OWNER: "Owner", EDITOR: "Can edit", VIEWER: "Can view" } as const;

/** Right-hand metadata panel for the selected item. */
export function DetailsPanel({ node, location, onClose }: { node: NodeDTO | null; location: string; onClose: () => void }) {
  return (
    <aside className="hidden w-80 shrink-0 flex-col border-l border-border bg-surface lg:flex">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="font-display truncate text-lg">{node ? node.name : "Details"}</h2>
        <button onClick={onClose} className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-foreground" aria-label="Close details">
          <X size={16} />
        </button>
      </div>
      {node ? (
        <div className="flex-1 overflow-y-auto px-5 py-5 text-sm">
          <div className="mb-6 flex h-36 items-center justify-center rounded-md border border-border bg-background">
            <FileIcon type={node.type} mimeType={node.mimeType} name={node.name} size={56} />
          </div>
          {node.type === "FILE" && <AiSection node={node} />}
          <dl className="divide-y divide-border">
            <Row label="Type">{node.type === "FOLDER" ? "Folder" : node.mimeType || "File"}</Row>
            {node.type === "FILE" && <Row label="Size">{formatBytes(node.size)}</Row>}
            {node.type === "FILE" && <Row label="Version">v{node.version}</Row>}
            <Row label="Location">{location}</Row>
            <Row label="Owner">{node.role === "OWNER" ? "me" : node.ownerName ?? "—"}</Row>
            <Row label="Your access">{ROLE_LABEL[node.role]}</Row>
            <Row label="Modified"><DateTimeText iso={node.updatedAt} /></Row>
            <Row label="Created"><DateTimeText iso={node.createdAt} /></Row>
            <Row label="Last opened"><DateTimeText iso={node.lastAccessedAt} /></Row>
            {node.trashedAt && <Row label="Trashed"><DateTimeText iso={node.trashedAt} /></Row>}
            <Row label="Sharing">{node.shared ? "Shared" : "Not shared"}</Row>
            <Row label="Starred">{node.starred ? "Yes" : "No"}</Row>
          </dl>
        </div>
      ) : (
        <p className="px-5 py-5 text-sm text-muted">Select an item to see its details.</p>
      )}
    </aside>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5">
      <dt className="w-24 shrink-0 text-xs text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** AI summary + tags for a file, with a button to (re)generate them. */
function AiSection({ node }: { node: NodeDTO }) {
  const { aiEnabled, toast } = useDrive();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!aiEnabled) return null;
  const pending = busy || node.ai.status === "pending";
  const stale = node.ai.status === "done" && node.ai.version !== node.version;

  async function generate() {
    setBusy(true);
    try {
      const r = await api<{ status: string; reason?: string }>("/api/ai/summarize", { method: "POST", body: { nodeId: node.id } });
      if (r.status === "skipped") toast(r.reason ?? "This file type cannot be summarized", { error: true });
      router.refresh();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  const empty = pending
    ? "Generating…"
    : node.ai.status === "skipped"
      ? "Not available for this file type."
      : node.ai.status === "failed"
        ? "Generation failed. Try again."
        : "No summary yet.";

  return (
    <section className="mb-5 rounded-md border border-border bg-background p-3">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles size={14} className="text-primary" />
        <span className="eyebrow">AI summary</span>
        {stale && <span className="text-[11px] text-muted">(from v{node.ai.version})</span>}
        <button
          onClick={generate}
          disabled={pending}
          className="ml-auto rounded-md p-1 text-muted hover:bg-hover hover:text-foreground disabled:opacity-40"
          aria-label={node.ai.summary ? "Regenerate summary" : "Generate summary"}
          title={node.ai.summary ? "Regenerate" : "Generate"}
        >
          <RefreshCw size={13} className={pending ? "animate-spin" : ""} />
        </button>
      </div>
      {node.ai.summary ? <p className="text-sm leading-relaxed">{node.ai.summary}</p> : <p className="text-xs text-muted">{empty}</p>}
      {node.ai.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {node.ai.tags.map((t) => (
            <span key={t} className="rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted">
              {t}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
