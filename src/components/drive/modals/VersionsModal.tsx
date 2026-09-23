"use client";

import { useEffect, useState } from "react";
import { Download, History, RotateCcw, Sparkles, Trash2, Upload } from "lucide-react";
import { Markdown } from "@/components/ui/Markdown";
import { useDrive } from "@/components/drive/DriveContext";
import { previewKind } from "@/lib/format";
import { Modal, Button } from "@/components/ui/Modal";
import { api } from "@/lib/client";
import { formatBytes } from "@/lib/format";
import type { NodeDTO } from "@/lib/nodes";
import type { VersionDTO } from "@/lib/versions";
import { useUpload } from "@/components/drive/UploadProvider";

type State = { versions: VersionDTO[]; role: NodeDTO["role"]; limit: number };

type Props = {
  node: NodeDTO | null;
  onClose: () => void;
  onChanged: () => void;
  toast: (m: string, opts?: { error?: boolean }) => void;
};

/** Drive-style "Manage versions": history list with upload / download / restore / delete. */
export function VersionsModal({ node, onClose, onChanged, toast }: Props) {
  return (
    <Modal open={!!node} onClose={onClose} title={`Versions of "${node?.name ?? ""}"`} width="max-w-2xl">
      {node && <Body node={node} onClose={onClose} onChanged={onChanged} toast={toast} />}
    </Modal>
  );
}

function Body({ node, onClose, onChanged, toast }: Props & { node: NodeDTO }) {
  const { uploadVersion } = useUpload();
  const { aiEnabled } = useDrive();
  const [state, setState] = useState<State | null>(null);
  const [diff, setDiff] = useState<{ versionId: string; text: string | null } | null>(null); // null text = loading
  const diffable = aiEnabled && ["text", "pdf"].includes(previewKind(node.mimeType, node.name));

  async function explain(v: VersionDTO) {
    const current = state?.versions.find((x) => x.current);
    if (!current) return;
    setDiff({ versionId: v.id, text: null });
    try {
      const r = await api<{ summary: string }>("/api/ai/version-diff", { method: "POST", body: { nodeId: node.id, fromId: v.id, toId: current.id } });
      setDiff({ versionId: v.id, text: r.summary });
    } catch (e) {
      setDiff({ versionId: v.id, text: `_${(e as Error).message}_` });
    }
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/nodes/${node.id}/versions`;

  async function load() {
    try {
      setState(await api<State>(base));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    let cancelled = false;
    api<State>(base)
      .then((s) => !cancelled && setState(s))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [base]);

  async function run(fn: () => Promise<unknown>, success?: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (success) toast(success);
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function pickNewVersion() {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) run(() => uploadVersion(node.id, node.name, file), "New version uploaded");
    };
    input.click();
  }

  const canEdit = state ? state.role !== "VIEWER" : false;
  const isOwner = state?.role === "OWNER";

  return (
    <>
      <p className="mb-4 text-sm text-muted">
        Older versions are kept until you delete them, up to {state?.limit ?? "…"} per file. All versions count toward the storage quota.
      </p>

      {canEdit && (
        <Button onClick={pickNewVersion} disabled={busy} className="mb-4 flex items-center gap-2">
          <Upload size={16} /> Upload new version
        </Button>
      )}
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-md border border-border bg-background">
        {!state && <li className="px-4 py-3 text-sm text-muted">Loading…</li>}
        {state?.versions.map((v) => (
          <li key={v.id} className={`px-4 py-2.5 text-sm ${v.current ? "bg-selected/60" : ""}`}>
            <div className="flex items-center gap-3">
            <History size={18} className="shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">Version {v.version}</span>
                {v.current && <span className="rounded-sm bg-foreground px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-background">Current</span>}
              </div>
              <div className="truncate text-xs text-muted">
                {new Date(v.createdAt).toLocaleString()} · {formatBytes(v.size)}
                {v.createdBy ? ` · ${v.createdBy}` : ""}
              </div>
            </div>
            <a
              href={`${base}/${v.id}/download`}
              className="rounded-md p-2 text-muted hover:bg-hover hover:text-foreground"
              aria-label={`Download version ${v.version}`}
              title="Download"
            >
              <Download size={18} />
            </a>
            {canEdit && !v.current && (
              <button
                onClick={() => run(() => api(`${base}/${v.id}/restore`, { method: "POST" }), `Version ${v.version} is now current`)}
                disabled={busy}
                className="rounded-md p-2 text-muted hover:bg-hover hover:text-foreground disabled:opacity-40"
                aria-label={`Restore version ${v.version}`}
                title="Make current"
              >
                <RotateCcw size={18} />
              </button>
            )}
            {isOwner && !v.current && (
              <button
                onClick={() => {
                  if (confirm(`Delete version ${v.version} forever?`)) run(() => api(`${base}/${v.id}`, { method: "DELETE" }), `Version ${v.version} deleted`);
                }}
                disabled={busy}
                className="rounded-md p-2 text-danger hover:bg-hover disabled:opacity-40"
                aria-label={`Delete version ${v.version}`}
                title="Delete"
              >
                <Trash2 size={18} />
              </button>
            )}
            </div>
            {diffable && !v.current && (
              <div className="mt-1 pl-[30px]">
                {diff?.versionId === v.id ? (
                  <div className="mt-1 rounded-md border border-border bg-surface p-3 text-xs">
                    {diff.text === null ? <span className="text-muted">Comparing with the current version…</span> : <Markdown>{diff.text}</Markdown>}
                  </div>
                ) : (
                  <button onClick={() => explain(v)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                    <Sparkles size={12} /> What changed vs current?
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="flex justify-end pt-5">
        <Button onClick={onClose}>Done</Button>
      </div>
    </>
  );
}
