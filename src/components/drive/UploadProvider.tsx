"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X, ChevronDown, ChevronUp, Check, AlertCircle } from "lucide-react";
import { api } from "@/lib/client";
import { FileIcon } from "@/components/drive/FileIcon";

type Item = {
  id: number;
  name: string;
  mimeType: string;
  size: number;
  progress: number; // 0..1
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};

/** A file to upload, optionally with the folder path it should land in (relative to the target). */
export type UploadEntry = { file: File; relDir?: string };

type UploadContextValue = {
  /** Queue files for upload into `parentId` (null = root). */
  upload: (files: (File | UploadEntry)[], parentId: string | null) => void;
  /** Open a picker for files or an entire folder. */
  pick: (opts: { directory?: boolean }, parentId: string | null) => void;
  /** Extract files (recursing into folders) from a drop event. */
  filesFromDrop: (dt: DataTransfer) => Promise<UploadEntry[]>;
  /** Upload `file` as a new version of an existing file node. Resolves when published. */
  uploadVersion: (nodeId: string, nodeName: string, file: File) => Promise<void>;
};

const UploadContext = createContext<UploadContextValue | null>(null);

const CONCURRENCY = 3;

/** init → PUT bytes (with progress) → complete. */
async function runUpload(file: File, parentId: string | null, onProgress: (p: number) => void) {
  const mimeType = file.type || "application/octet-stream";
  const { nodeId, uploadUrl } = await api<{ nodeId: string; uploadUrl: string }>("/api/upload/init", {
    method: "POST",
    body: { name: file.name, size: file.size, mimeType, parentId },
  });
  await putBytes(uploadUrl, file, mimeType, onProgress);
  await api("/api/upload/complete", { method: "POST", body: { nodeId } });
}

/** Same three steps, but against the version endpoints of an existing file. */
async function runVersionUpload(nodeId: string, file: File, onProgress: (p: number) => void) {
  const mimeType = file.type || "application/octet-stream";
  const { versionId, uploadUrl } = await api<{ versionId: string; uploadUrl: string }>(`/api/nodes/${nodeId}/versions`, {
    method: "POST",
    body: { size: file.size, mimeType },
  });
  await putBytes(uploadUrl, file, mimeType, onProgress);
  await api(`/api/nodes/${nodeId}/versions/complete`, { method: "POST", body: { versionId } });
}

function putBytes(uploadUrl: string, file: File, mimeType: string, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", mimeType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}

/** Walks dropped items, descending into directories via the FileSystem Entry API when available. */
async function filesFromDrop(dt: DataTransfer): Promise<UploadEntry[]> {
  const items = Array.from(dt.items ?? []);
  const entries = items.map((it) => (it.kind === "file" ? it.webkitGetAsEntry?.() ?? null : null));
  if (!entries.some(Boolean)) return Array.from(dt.files).map((file) => ({ file }));

  const out: UploadEntry[] = [];
  async function walk(entry: FileSystemEntry, dir: string) {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      out.push({ file, relDir: dir || undefined });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries returns in batches; loop until empty.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const child of batch) await walk(child, dir ? `${dir}/${entry.name}` : entry.name);
      }
    }
  }
  for (const e of entries) if (e) await walk(e, "");
  return out;
}

export function UploadProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const queue = useRef<{ id: number; file: File; parentId: string | null; relDir?: string }[]>([]);
  // Resolved folder ids for "<parentId>/<relDir>" so sibling files share one lookup.
  const dirCache = useRef(new Map<string, Promise<string | null>>());
  const active = useRef(0);
  const nextId = useRef(1);

  const patch = useCallback((id: number, data: Partial<Item>) => {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...data } : it)));
  }, []);

  function pump() {
    while (active.current < CONCURRENCY && queue.current.length) {
      const job = queue.current.shift()!;
      active.current++;
      resolveDir(job.parentId, job.relDir)
        .then((target) => runUpload(job.file, target, (p) => patch(job.id, { progress: p, status: "uploading" })))
        .then(() => {
          patch(job.id, { progress: 1, status: "done" });
          router.refresh();
        })
        .catch((e: Error) => patch(job.id, { status: "error", error: e.message }))
        .finally(() => {
          active.current--;
          pump();
        });
    }
  }

  /** Maps a relative directory path to a folder id, creating folders on first use. */
  function resolveDir(parentId: string | null, relDir?: string): Promise<string | null> {
    if (!relDir) return Promise.resolve(parentId);
    const key = `${parentId ?? ""}/${relDir}`;
    let p = dirCache.current.get(key);
    if (!p) {
      p = api<{ id: string }>("/api/nodes/path", {
        method: "POST",
        body: { parentId, segments: relDir.split("/").filter(Boolean) },
      }).then((r) => r.id);
      dirCache.current.set(key, p);
    }
    return p;
  }

  function upload(input: (File | UploadEntry)[], parentId: string | null) {
    const entries = input.map((f) => (f instanceof File ? { file: f } : f));
    if (!entries.length) return;
    const added = entries.map((e) => ({ id: nextId.current++, file: e.file, parentId, relDir: e.relDir }));
    setItems((list) => [
      ...list,
      ...added.map<Item>((a) => ({
        id: a.id,
        name: a.relDir ? `${a.relDir}/${a.file.name}` : a.file.name,
        mimeType: a.file.type,
        size: a.file.size,
        progress: 0,
        status: "queued",
      })),
    ]);
    queue.current.push(...added);
    setCollapsed(false);
    pump();
  }

  /** Version uploads bypass the queue (one at a time, awaited by the caller) but show in the panel. */
  async function uploadVersion(nodeId: string, nodeName: string, file: File) {
    const id = nextId.current++;
    setItems((list) => [...list, { id, name: `${nodeName} (new version)`, mimeType: file.type, size: file.size, progress: 0, status: "uploading" }]);
    setCollapsed(false);
    try {
      await runVersionUpload(nodeId, file, (p) => patch(id, { progress: p }));
      patch(id, { progress: 1, status: "done" });
      router.refresh();
    } catch (e) {
      patch(id, { status: "error", error: (e as Error).message });
      throw e;
    }
  }

  function pick({ directory = false }: { directory?: boolean }, parentId: string | null) {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    if (directory) input.webkitdirectory = true;
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      upload(
        files.map((file) => {
          // webkitRelativePath is "Folder/sub/file.txt"; keep the top-level folder name.
          const rel = file.webkitRelativePath;
          const dir = rel ? rel.slice(0, rel.lastIndexOf("/")) : "";
          return { file, relDir: dir || undefined };
        }),
        parentId,
      );
    };
    input.click();
  }

  const doneCount = items.filter((i) => i.status === "done").length;
  const busyCount = items.filter((i) => i.status === "queued" || i.status === "uploading").length;

  return (
    <UploadContext.Provider value={{ upload, pick, filesFromDrop, uploadVersion }}>
      {children}
      {items.length > 0 && (
        <div className="fixed bottom-4 right-4 z-40 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-surface shadow-[0_24px_60px_-20px_rgba(31,27,22,0.4)] animate-fade-in">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-medium">
              {busyCount > 0
                ? `Uploading ${busyCount} item${busyCount === 1 ? "" : "s"}`
                : `${doneCount} upload${doneCount === 1 ? "" : "s"} complete`}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setCollapsed((c) => !c)} className="rounded-md p-1 hover:bg-hover" aria-label={collapsed ? "Expand" : "Collapse"}>
                {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              <button onClick={() => setItems([])} disabled={busyCount > 0} className="rounded-md p-1 hover:bg-hover disabled:opacity-40" aria-label="Close">
                <X size={16} />
              </button>
            </div>
          </div>
          {!collapsed && (
            <ul className="max-h-64 divide-y divide-border overflow-y-auto">
              {items.map((it) => (
                <li key={it.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <FileIcon mimeType={it.mimeType} name={it.name} type="FILE" size={18} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{it.name}</div>
                    {it.status === "error" ? (
                      <div className="truncate text-xs text-danger">{it.error}</div>
                    ) : it.status !== "done" ? (
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full bg-foreground transition-[width]" style={{ width: `${Math.round(it.progress * 100)}%` }} />
                      </div>
                    ) : null}
                  </div>
                  {it.status === "done" && <Check size={16} className="shrink-0 text-primary" />}
                  {it.status === "error" && <AlertCircle size={16} className="shrink-0 text-danger" />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </UploadContext.Provider>
  );
}

export function useUpload() {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUpload must be used inside UploadProvider");
  return ctx;
}
