"use client";

import { useCallback, useEffect, useMemo, useState, type DragEvent, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Download,
  Eye,
  FolderInput,
  FolderPlus,
  FolderUp,
  History,
  Info,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Sparkles,
  Star,
  StarOff,
  Trash2,
  Upload,
  UserPlus,
  Users,
  CloudUpload,
  X,
} from "lucide-react";
import { api } from "@/lib/client";
import { formatBytes, previewKind } from "@/lib/format";
import { DateText } from "@/components/ui/DateText";
import type { NodeDTO } from "@/lib/nodes";
import { useDrive } from "@/components/drive/DriveContext";
import { useUpload } from "@/components/drive/UploadProvider";
import { FileIcon } from "@/components/drive/FileIcon";
import { DetailsPanel } from "@/components/drive/DetailsPanel";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { Button } from "@/components/ui/Modal";
import { NameModal } from "@/components/drive/modals/NameModal";
import { MoveModal } from "@/components/drive/modals/MoveModal";
import { ShareModal } from "@/components/drive/modals/ShareModal";
import { VersionsModal } from "@/components/drive/modals/VersionsModal";
import { PreviewModal, fileUrl } from "@/components/drive/modals/PreviewModal";

export type View = "drive" | "shared" | "recent" | "starred" | "trash" | "search" | "public";

type Crumb = { id: string; name: string };
type SortKey = "name" | "modified" | "size";
type Sort = { key: SortKey; dir: "asc" | "desc" };

/** MIME type used for internal drag-to-move payloads. */
const DND_TYPE = "application/x-vaultly-ids";

const VIEW_EYEBROW: Record<View, string> = {
  drive: "Library",
  shared: "Library",
  recent: "Library",
  starred: "Library",
  trash: "Library",
  search: "Search",
  public: "Shared with you",
};

type Props = {
  view: View;
  items: NodeDTO[];
  title: string;
  folderId?: string | null;
  canWrite?: boolean;
  breadcrumb?: Crumb[];
  /** Public share-link mode. */
  linkToken?: string;
  /** Where the root breadcrumb links to (defaults to All files). */
  rootHref?: string;
  emptyText?: string;
};

export function FileBrowser({
  view,
  items,
  title,
  folderId = null,
  canWrite = false,
  breadcrumb = [],
  linkToken,
  rootHref,
  emptyText,
}: Props) {
  const router = useRouter();
  const { layout, setLayout, setCurrent, toast, aiEnabled } = useDrive();
  const { upload, pick, filesFromDrop } = useUpload();

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [anchor, setAnchor] = useState<string | null>(null); // for shift-click ranges
  const [menu, setMenu] = useState<{ x: number; y: number; node: NodeDTO | null } | null>(null);
  const [renaming, setRenaming] = useState<NodeDTO | null>(null);
  const [moving, setMoving] = useState<NodeDTO[] | null>(null);
  const [sharing, setSharing] = useState<NodeDTO | null>(null);
  const [versions, setVersions] = useState<NodeDTO | null>(null);
  const [preview, setPreview] = useState<NodeDTO | null>(null);
  const [previewAi, setPreviewAi] = useState(false);
  const [newFolder, setNewFolder] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null); // folder id (or "root") hovered with a move drag
  const [sort, setSort] = useState<Sort>({ key: "name", dir: "asc" });
  const [details, setDetails] = useState(false);

  const isPublic = view === "public";
  const isTrash = view === "trash";

  const section = rootHref === "/files/shared" ? "shared" : "drive";
  useEffect(() => {
    setCurrent({ folderId, canWrite, section });
  }, [folderId, canWrite, section, setCurrent]);

  // Selection is derived against the live listing so removed items drop out automatically.
  const itemIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const liveSelected = useMemo(() => new Set([...selected].filter((id) => itemIds.has(id))), [selected, itemIds]);
  const selectedNodes = useMemo(() => items.filter((i) => liveSelected.has(i.id)), [items, liveSelected]);

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const dateOf = (n: NodeDTO) => (view === "recent" ? n.lastAccessedAt : isTrash && n.trashedAt ? n.trashedAt : n.updatedAt);
    const cmp = (a: NodeDTO, b: NodeDTO) => {
      switch (sort.key) {
        case "modified":
          return (dateOf(a) < dateOf(b) ? -1 : dateOf(a) > dateOf(b) ? 1 : 0) * dir;
        case "size":
          return (a.size - b.size) * dir;
        default:
          return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }) * dir;
      }
    };
    return [...items].sort(cmp);
  }, [items, sort, view, isTrash]);

  const folders = useMemo(() => sorted.filter((i) => i.type === "FOLDER"), [sorted]);
  const files = useMemo(() => sorted.filter((i) => i.type === "FILE"), [sorted]);
  const ordered = useMemo(() => [...folders, ...files], [folders, files]); // display order, for shift-click
  const previewable = useMemo(() => files.filter((f) => previewKind(f.mimeType, f.name) !== "none"), [files]);

  const folderHref = useCallback(
    (id: string) => (isPublic ? `/s/${linkToken}?folder=${id}` : `/files/folder/${id}`),
    [isPublic, linkToken],
  );

  const refresh = useCallback(() => router.refresh(), [router]);

  async function act(fn: () => Promise<unknown>, success?: string) {
    try {
      await fn();
      if (success) toast(success);
      refresh();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  }

  /** Runs a bulk action against /api/nodes/batch and reports partial failures. */
  async function batch(ids: string[], action: string, extra: Record<string, unknown> = {}, success?: (n: number) => string) {
    try {
      const res = await api<{ ok: number; failed: { id: string; error: string }[] }>("/api/nodes/batch", {
        method: "POST",
        body: { ids, action, ...extra },
      });
      if (res.failed.length) toast(`${res.failed.length} item${res.failed.length === 1 ? "" : "s"} failed: ${res.failed[0].error}`, { error: true });
      else if (success) toast(success(res.ok));
      setSelected(new Set());
      refresh();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  }

  // --- selection ---
  function select(node: NodeDTO, e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) {
    const multi = e.ctrlKey || e.metaKey;
    if (e.shiftKey && anchor) {
      const a = ordered.findIndex((n) => n.id === anchor);
      const b = ordered.findIndex((n) => n.id === node.id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const range = ordered.slice(lo, hi + 1).map((n) => n.id);
        setSelected(new Set(multi ? [...liveSelected, ...range] : range));
        return;
      }
    }
    setAnchor(node.id);
    if (multi) {
      const next = new Set(liveSelected);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      setSelected(next);
    } else {
      setSelected(new Set([node.id]));
    }
  }

  function openPreview(node: NodeDTO, withAi = false) {
    setPreviewAi(withAi);
    setPreview(node);
  }

  function open(node: NodeDTO) {
    if (node.type === "FOLDER") {
      if (isTrash) return toast("Restore this folder to open it");
      router.push(folderHref(node.id));
    } else {
      openPreview(node);
    }
  }

  function download(nodes: NodeDTO[]) {
    if (nodes.length === 1 && nodes[0].type === "FILE") return triggerDownload(fileUrl(nodes[0], false, linkToken));
    const q = new URLSearchParams({ ids: nodes.map((n) => n.id).join(",") });
    if (linkToken) q.set("token", linkToken);
    triggerDownload(`/api/download/zip?${q}`);
  }

  // --- menus ---
  function itemsFor(node: NodeDTO): MenuItem[] {
    // Right-clicking one of several selected items acts on the whole selection.
    const targets = liveSelected.has(node.id) && liveSelected.size > 1 ? selectedNodes : [node];
    if (targets.length > 1) return bulkItems(targets);

    const canEdit = node.role !== "VIEWER";
    const isOwner = node.role === "OWNER";
    if (isTrash) {
      return [
        { label: "Restore", icon: <RotateCcw />, onSelect: () => act(() => api(`/api/nodes/${node.id}/restore`, { method: "POST" }), "Restored") },
        { label: "Delete forever", icon: <Trash2 />, danger: true, onSelect: () => confirmDelete([node]) },
      ];
    }
    const out: MenuItem[] = [];
    if (node.type === "FOLDER") out.push({ label: "Open", icon: <Eye />, onSelect: () => open(node) });
    else out.push({ label: "Preview", icon: <Eye />, onSelect: () => openPreview(node) });
    out.push({ label: "Download", icon: <Download />, onSelect: () => download([node]) });
    if (isPublic) return out;
    if (node.type === "FILE" && aiEnabled && previewKind(node.mimeType, node.name) !== "none") {
      out.push({ label: "Ask AI", icon: <Sparkles />, onSelect: () => openPreview(node, true) });
    }
    out.push({ type: "separator" });
    out.push({ label: "Rename", icon: <Pencil />, disabled: !canEdit, onSelect: () => setRenaming(node) });
    out.push({ label: "Share", icon: <UserPlus />, disabled: !isOwner, onSelect: () => setSharing(node) });
    out.push({ label: "Move to", icon: <FolderInput />, disabled: !isOwner, onSelect: () => setMoving([node]) });
    out.push({
      label: node.starred ? "Remove from starred" : "Add to starred",
      icon: node.starred ? <StarOff /> : <Star />,
      onSelect: () => act(() => api(`/api/nodes/${node.id}`, { method: "PATCH", body: { starred: !node.starred } })),
    });
    if (node.type === "FILE") out.push({ label: "Manage versions", icon: <History />, onSelect: () => setVersions(node) });
    out.push({ label: "Details", icon: <Info />, onSelect: () => setDetails(true) });
    out.push({ type: "separator" });
    out.push({
      label: "Move to trash",
      icon: <Trash2 />,
      disabled: !canEdit,
      onSelect: () => act(() => api(`/api/nodes/${node.id}`, { method: "DELETE" }), `"${node.name}" moved to trash`),
    });
    return out;
  }

  function bulkItems(targets: NodeDTO[]): MenuItem[] {
    const ids = targets.map((n) => n.id);
    const n = targets.length;
    if (isTrash) {
      return [
        { label: `Restore ${n} items`, icon: <RotateCcw />, onSelect: () => batch(ids, "restore", {}, (k) => `Restored ${k} items`) },
        { label: `Delete ${n} items forever`, icon: <Trash2 />, danger: true, onSelect: () => confirmDelete(targets) },
      ];
    }
    const out: MenuItem[] = [{ label: `Download ${n} items`, icon: <Download />, onSelect: () => download(targets) }];
    if (isPublic) return out;
    const allOwned = targets.every((t) => t.role === "OWNER");
    const allEditable = targets.every((t) => t.role !== "VIEWER");
    const allStarred = targets.every((t) => t.starred);
    out.push({ type: "separator" });
    out.push({ label: "Move to", icon: <FolderInput />, disabled: !allOwned, onSelect: () => setMoving(targets) });
    out.push({
      label: allStarred ? "Remove from starred" : "Add to starred",
      icon: allStarred ? <StarOff /> : <Star />,
      onSelect: () => batch(ids, allStarred ? "unstar" : "star"),
    });
    out.push({ type: "separator" });
    out.push({
      label: `Move ${n} items to trash`,
      icon: <Trash2 />,
      disabled: !allEditable,
      onSelect: () => batch(ids, "trash", {}, (k) => `${k} items moved to trash`),
    });
    return out;
  }

  function confirmDelete(targets: NodeDTO[]) {
    const label = targets.length === 1 ? `"${targets[0].name}"` : `${targets.length} items`;
    if (!confirm(`Delete ${label} forever? This cannot be undone.`)) return;
    batch(targets.map((t) => t.id), "delete", {}, (k) => `Deleted ${k} item${k === 1 ? "" : "s"} forever`);
  }

  const backgroundItems: MenuItem[] = canWrite
    ? [
        { label: "New folder", icon: <FolderPlus />, onSelect: () => setNewFolder(true) },
        { label: "Upload files", icon: <Upload />, onSelect: () => pick({}, folderId) },
        { label: "Upload folder", icon: <FolderUp />, onSelect: () => pick({ directory: true }, folderId) },
      ]
    : [];

  function onContextMenu(e: MouseEvent, node: NodeDTO | null) {
    e.preventDefault();
    e.stopPropagation();
    if (node && !liveSelected.has(node.id)) setSelected(new Set([node.id]));
    if (!node && backgroundItems.length === 0) return;
    setMenu({ x: e.clientX, y: e.clientY, node });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSelected(new Set(items.map((i) => i.id)));
      return;
    }
    if (e.key === "Escape") {
      setSelected(new Set());
      return;
    }
    if (selectedNodes.length === 0) return;
    if (e.key === "Enter" && selectedNodes.length === 1) open(selectedNodes[0]);
    if (e.key === "Delete" && !isTrash && !isPublic && selectedNodes.every((n) => n.role !== "VIEWER")) {
      batch(selectedNodes.map((n) => n.id), "trash", {}, (k) => `${k} item${k === 1 ? "" : "s"} moved to trash`);
    }
  }

  // --- drag & drop: file uploads from the OS, and moving items between folders ---
  const canMove = !isTrash && !isPublic;

  function onDragStart(e: DragEvent, node: NodeDTO) {
    if (!canMove || node.role !== "OWNER") return e.preventDefault();
    const ids = liveSelected.has(node.id) ? [...liveSelected] : [node.id];
    e.dataTransfer.setData(DND_TYPE, JSON.stringify(ids));
    e.dataTransfer.effectAllowed = "move";
  }

  function isMoveDrag(e: DragEvent) {
    return e.dataTransfer.types.includes(DND_TYPE);
  }

  /** Drop-target handlers for a folder (or the root breadcrumb). */
  function dropHandlers(targetId: string | null, key: string) {
    return {
      onDragOver: (e: DragEvent) => {
        if (!isMoveDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        if (dropTarget !== key) setDropTarget(key);
      },
      onDragLeave: (e: DragEvent) => {
        if (isMoveDrag(e) && dropTarget === key) setDropTarget(null);
      },
      onDrop: (e: DragEvent) => {
        if (!isMoveDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setDropTarget(null);
        const ids: string[] = JSON.parse(e.dataTransfer.getData(DND_TYPE) || "[]").filter((id: string) => id !== targetId);
        if (!ids.length) return;
        batch(ids, "move", { parentId: targetId }, (k) => `Moved ${k} item${k === 1 ? "" : "s"}`);
      },
    };
  }

  function onDragOver(e: DragEvent) {
    if (isMoveDrag(e)) return; // handled by folder targets
    if (!canWrite || !e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setDragOver(true);
  }
  async function onDrop(e: DragEvent) {
    if (isMoveDrag(e)) return;
    if (!canWrite) return;
    e.preventDefault();
    setDragOver(false);
    upload(await filesFromDrop(e.dataTransfer), folderId);
  }

  const showBreadcrumb = view === "drive" || view === "public";
  const sel = selectedNodes;
  const dateHeader = view === "recent" ? "Last opened" : isTrash ? "Trashed" : "Modified";
  const location = breadcrumb.length ? breadcrumb.map((c) => c.name).join(" / ") : title;
  const currentTitle = breadcrumb.length ? breadcrumb[breadcrumb.length - 1].name : title;
  const count = `${items.length} item${items.length === 1 ? "" : "s"}`;

  return (
    <div className="flex h-full min-w-0">
      <div
        className="relative flex h-full min-w-0 flex-1 flex-col outline-none"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onDragOver={onDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onContextMenu={(e) => onContextMenu(e, null)}
        onClick={() => setSelected(new Set())}
      >
        {/* Title block: eyebrow breadcrumb + serif title, or the selection toolbar */}
        <div className="px-6 pt-6 pb-3 sm:px-8">
          {sel.length > 0 && !isPublic ? (
            <div className="flex min-h-[60px] items-center gap-1 rounded-md border border-border bg-surface px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setSelected(new Set())} className="rounded-md p-2 hover:bg-hover" aria-label="Clear selection">
                <X size={18} />
              </button>
              <span className="mr-3 text-sm font-medium whitespace-nowrap">{sel.length} selected</span>
              {isTrash ? (
                <>
                  <ToolbarButton label="Restore" onClick={() => batch(sel.map((n) => n.id), "restore", {}, (k) => `Restored ${k} items`)}>
                    <RotateCcw size={16} />
                  </ToolbarButton>
                  <ToolbarButton label="Delete forever" onClick={() => confirmDelete(sel)}>
                    <Trash2 size={16} />
                  </ToolbarButton>
                </>
              ) : (
                <>
                  <ToolbarButton label="Download" onClick={() => download(sel)}>
                    <Download size={16} />
                  </ToolbarButton>
                  <ToolbarButton label="Move to" disabled={!sel.every((n) => n.role === "OWNER")} onClick={() => setMoving(sel)}>
                    <FolderInput size={16} />
                  </ToolbarButton>
                  <ToolbarButton
                    label={sel.every((n) => n.starred) ? "Remove from starred" : "Add to starred"}
                    onClick={() => batch(sel.map((n) => n.id), sel.every((n) => n.starred) ? "unstar" : "star")}
                  >
                    <Star size={16} className={sel.every((n) => n.starred) ? "fill-current" : ""} />
                  </ToolbarButton>
                  <ToolbarButton
                    label="Move to trash"
                    disabled={!sel.every((n) => n.role !== "VIEWER")}
                    onClick={() => batch(sel.map((n) => n.id), "trash", {}, (k) => `${k} item${k === 1 ? "" : "s"} moved to trash`)}
                  >
                    <Trash2 size={16} />
                  </ToolbarButton>
                </>
              )}
            </div>
          ) : (
            <div className="flex min-h-[60px] items-end justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-1 text-muted">
                  {showBreadcrumb ? (
                    <>
                      <Crumb
                        href={rootHref ?? (isPublic ? `/s/${linkToken}` : "/files")}
                        active={breadcrumb.length === 0}
                        drop={canMove && !isPublic && view === "drive" && section === "drive" ? dropHandlers(null, "root") : undefined}
                        highlight={dropTarget === "root"}
                      >
                        {title}
                      </Crumb>
                      {breadcrumb.slice(0, -1).map((c) => (
                        <span key={c.id} className="flex min-w-0 items-center gap-1">
                          <ChevronRight size={12} className="shrink-0" />
                          <Crumb href={folderHref(c.id)} active={false} drop={canMove ? dropHandlers(c.id, c.id) : undefined} highlight={dropTarget === c.id}>
                            {c.name}
                          </Crumb>
                        </span>
                      ))}
                    </>
                  ) : (
                    <span className="eyebrow">{VIEW_EYEBROW[view]}</span>
                  )}
                </div>
                <h1 className="font-display truncate text-[32px] leading-none">{currentTitle}</h1>
              </div>

              <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <span className="hidden text-xs text-muted sm:inline">{count}</span>
                {isTrash && items.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (confirm("Permanently delete everything in the trash? This cannot be undone.")) {
                        act(() => api("/api/trash/empty", { method: "POST" }), "Trash emptied");
                      }
                    }}
                  >
                    Empty trash
                  </Button>
                )}
                {layout === "grid" && items.length > 0 && (
                  <select
                    value={`${sort.key}:${sort.dir}`}
                    onChange={(e) => {
                      const [key, dir] = e.target.value.split(":") as [SortKey, Sort["dir"]];
                      setSort({ key, dir });
                    }}
                    className="hidden rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm sm:block"
                    aria-label="Sort by"
                  >
                    <option value="name:asc">Name A–Z</option>
                    <option value="name:desc">Name Z–A</option>
                    <option value="modified:desc">Newest first</option>
                    <option value="modified:asc">Oldest first</option>
                    <option value="size:desc">Largest first</option>
                    <option value="size:asc">Smallest first</option>
                  </select>
                )}
                <div className="flex overflow-hidden rounded-md border border-border bg-surface">
                  <button
                    onClick={() => setLayout("list")}
                    className={`px-2.5 py-1.5 ${layout === "list" ? "bg-foreground text-background" : "hover:bg-hover"}`}
                    aria-label="List view"
                    aria-pressed={layout === "list"}
                  >
                    <List size={16} />
                  </button>
                  <button
                    onClick={() => setLayout("grid")}
                    className={`px-2.5 py-1.5 ${layout === "grid" ? "bg-foreground text-background" : "hover:bg-hover"}`}
                    aria-label="Grid view"
                    aria-pressed={layout === "grid"}
                  >
                    <LayoutGrid size={16} />
                  </button>
                </div>
                {!isPublic && (
                  <button
                    onClick={() => setDetails((d) => !d)}
                    className={`hidden rounded-md border border-border p-1.5 lg:block ${details ? "bg-foreground text-background" : "bg-surface hover:bg-hover"}`}
                    aria-label="Toggle details"
                    aria-pressed={details}
                  >
                    <Info size={16} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {isTrash && items.length > 0 && (
          <p className="mx-6 mb-2 text-xs text-muted sm:mx-8">Items in the trash are kept until you delete them forever.</p>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 pb-10 sm:px-8">
          {items.length === 0 ? (
            <Empty view={view} canWrite={canWrite} text={emptyText} onUpload={() => pick({}, folderId)} />
          ) : layout === "grid" ? (
            <>
              {folders.length > 0 && (
                <Section label="Folders" count={folders.length}>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
                    {folders.map((n) => (
                      <FolderCard
                        key={n.id}
                        node={n}
                        selected={liveSelected.has(n.id)}
                        highlight={dropTarget === n.id}
                        onSelect={(e) => select(n, e)}
                        onOpen={() => open(n)}
                        onMenu={(e) => onContextMenu(e, n)}
                        onDragStart={(e) => onDragStart(e, n)}
                        drop={canMove && !isPublic ? dropHandlers(n.id, n.id) : undefined}
                      />
                    ))}
                  </div>
                </Section>
              )}
              {files.length > 0 && (
                <Section label="Files" count={files.length}>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
                    {files.map((n) => (
                      <FileCard
                        key={n.id}
                        node={n}
                        linkToken={linkToken}
                        selected={liveSelected.has(n.id)}
                        onSelect={(e) => select(n, e)}
                        onOpen={() => open(n)}
                        onMenu={(e) => onContextMenu(e, n)}
                        onDragStart={(e) => onDragStart(e, n)}
                      />
                    ))}
                  </div>
                </Section>
              )}
            </>
          ) : (
            <table className="w-full border-t border-border text-sm">
              <thead>
                <tr className="border-b border-border">
                  <SortHeader label="Name" k="name" sort={sort} setSort={setSort} className="pl-2" />
                  <th className="eyebrow hidden w-40 py-2.5 text-left md:table-cell">Owner</th>
                  <SortHeader label={dateHeader} k="modified" sort={sort} setSort={setSort} className="hidden w-36 sm:table-cell" />
                  <SortHeader label="Size" k="size" sort={sort} setSort={setSort} className="hidden w-24 sm:table-cell" />
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {ordered.map((n) => {
                  const isSel = liveSelected.has(n.id);
                  const drop = n.type === "FOLDER" && canMove && !isPublic ? dropHandlers(n.id, n.id) : {};
                  return (
                    <tr
                      key={n.id}
                      draggable={canMove && n.role === "OWNER"}
                      onDragStart={(e) => onDragStart(e, n)}
                      {...drop}
                      onClick={(e) => {
                        e.stopPropagation();
                        select(n, e);
                      }}
                      onDoubleClick={() => open(n)}
                      onContextMenu={(e) => onContextMenu(e, n)}
                      className={`cursor-default border-b border-border transition-colors ${isSel ? "bg-selected" : dropTarget === n.id ? "bg-primary-soft" : "hover:bg-hover/60"}`}
                    >
                      <td className="py-2.5 pl-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <FileIcon type={n.type} mimeType={n.mimeType} name={n.name} size={18} />
                          <span className="truncate">{n.name}</span>
                          {n.shared && <Users size={13} className="shrink-0 text-muted" aria-label="Shared" />}
                          {n.starred && <Star size={13} className="shrink-0 fill-current text-primary" aria-label="Starred" />}
                        </div>
                      </td>
                      <td className="hidden py-2.5 text-muted md:table-cell">{n.role === "OWNER" ? "me" : n.ownerName}</td>
                      <td className="hidden py-2.5 text-muted sm:table-cell">
                        <DateText iso={view === "recent" ? n.lastAccessedAt : isTrash && n.trashedAt ? n.trashedAt : n.updatedAt} />
                      </td>
                      <td className="hidden py-2.5 font-mono text-xs text-muted sm:table-cell">{n.type === "FILE" ? formatBytes(n.size) : "—"}</td>
                      <td className="py-1 pr-1 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onContextMenu(e, n);
                          }}
                          className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-foreground"
                          aria-label="More actions"
                        >
                          <MoreHorizontal size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {dragOver && (
          <div className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-foreground/40 bg-background/70">
            <div className="flex items-center gap-3 rounded-md border border-border bg-surface px-5 py-3 text-sm shadow">
              <CloudUpload size={18} className="text-primary" /> Drop files or folders to upload
            </div>
          </div>
        )}

        <Menu
          position={menu ? { x: menu.x, y: menu.y } : null}
          items={menu?.node ? itemsFor(menu.node) : backgroundItems}
          onClose={() => setMenu(null)}
        />

        <NameModal
          open={!!renaming}
          title="Rename"
          initial={renaming?.name ?? ""}
          onClose={() => setRenaming(null)}
          onSubmit={async (name) => {
            await api(`/api/nodes/${renaming!.id}`, { method: "PATCH", body: { name } });
            refresh();
          }}
        />
        <NameModal
          open={newFolder}
          title="New folder"
          initial="Untitled folder"
          submitLabel="Create"
          onClose={() => setNewFolder(false)}
          onSubmit={async (name) => {
            await api("/api/nodes", { method: "POST", body: { name, parentId: folderId } });
            refresh();
          }}
        />
        <MoveModal
          open={!!moving}
          nodes={moving ?? []}
          onClose={() => setMoving(null)}
          onMove={async (parentId) => {
            const ids = (moving ?? []).map((n) => n.id);
            const res = await api<{ ok: number; failed: { error: string }[] }>("/api/nodes/batch", {
              method: "POST",
              body: { ids, action: "move", parentId },
            });
            if (res.failed.length) throw new Error(res.failed[0].error);
            toast(ids.length === 1 ? "Moved" : `Moved ${res.ok} items`);
            setSelected(new Set());
            refresh();
          }}
        />
        <ShareModal open={!!sharing} node={sharing} onClose={() => setSharing(null)} onChanged={refresh} toast={toast} />
        <VersionsModal node={versions} onClose={() => setVersions(null)} onChanged={refresh} toast={toast} />
        <PreviewModal node={preview} siblings={previewable} linkToken={linkToken} initialAi={previewAi} onClose={() => setPreview(null)} onNavigate={setPreview} />
      </div>

      {details && !isPublic && (
        <DetailsPanel node={sel.length === 1 ? sel[0] : null} location={location} onClose={() => setDetails(false)} />
      )}
    </div>
  );
}

/** Starts a browser download without navigating away (works for redirects to presigned URLs too). */
function triggerDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

type DropHandlers = { onDragOver: (e: DragEvent) => void; onDragLeave: (e: DragEvent) => void; onDrop: (e: DragEvent) => void };

function ToolbarButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} className="rounded-md p-2 hover:bg-hover disabled:opacity-40 disabled:hover:bg-transparent" aria-label={label} title={label}>
      {children}
    </button>
  );
}

function SortHeader({ label, k, sort, setSort, className = "" }: { label: string; k: SortKey; sort: Sort; setSort: (s: Sort) => void; className?: string }) {
  const active = sort.key === k;
  return (
    <th className={`py-2.5 text-left ${className}`}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setSort({ key: k, dir: active && sort.dir === "asc" ? "desc" : "asc" });
        }}
        className={`eyebrow inline-flex items-center gap-1 rounded-sm hover:text-foreground ${active ? "text-foreground" : ""}`}
      >
        {label}
        {active && (sort.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );
}

function Crumb({
  href,
  active,
  drop,
  highlight,
  children,
}: {
  href: string;
  active: boolean;
  drop?: DropHandlers;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      {...drop}
      className={`eyebrow truncate rounded-sm px-1 py-0.5 hover:text-foreground ${active ? "text-foreground" : ""} ${highlight ? "bg-primary-soft text-foreground" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </Link>
  );
}

function Section({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline gap-2 border-b border-border pb-2">
        <h2 className="eyebrow">{label}</h2>
        <span className="text-xs text-muted">{count}</span>
      </div>
      {children}
    </section>
  );
}

type CardProps = {
  node: NodeDTO;
  selected: boolean;
  onSelect: (e: MouseEvent) => void;
  onOpen: () => void;
  onMenu: (e: MouseEvent) => void;
  onDragStart: (e: DragEvent) => void;
};

const cardBase = "group cursor-default select-none rounded-md border transition-colors";
const cardState = (selected: boolean, highlight = false) =>
  selected ? "border-foreground bg-selected" : highlight ? "border-primary bg-primary-soft" : "border-border bg-surface hover:border-border-strong";

function FolderCard({ node, selected, highlight, onSelect, onOpen, onMenu, onDragStart, drop }: CardProps & { highlight: boolean; drop?: DropHandlers }) {
  return (
    <div
      draggable={node.role === "OWNER"}
      onDragStart={onDragStart}
      {...drop}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(e);
      }}
      onDoubleClick={onOpen}
      onContextMenu={onMenu}
      className={`${cardBase} flex items-center gap-3 px-3.5 py-3 ${cardState(selected, highlight)}`}
    >
      <FileIcon type="FOLDER" name={node.name} size={20} />
      <span className="flex-1 truncate text-sm font-medium">{node.name}</span>
      {node.shared && <Users size={13} className="text-muted" aria-label="Shared" />}
      {node.starred && <Star size={13} className="fill-current text-primary" aria-label="Starred" />}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onMenu(e);
        }}
        className="rounded-md p-1 text-muted opacity-0 hover:bg-hover hover:text-foreground group-hover:opacity-100"
        aria-label="More actions"
      >
        <MoreHorizontal size={16} />
      </button>
    </div>
  );
}

function FileCard({ node, linkToken, selected, onSelect, onOpen, onMenu, onDragStart }: CardProps & { linkToken?: string }) {
  const kind = previewKind(node.mimeType, node.name);
  return (
    <div
      draggable={node.role === "OWNER"}
      onDragStart={onDragStart}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(e);
      }}
      onDoubleClick={onOpen}
      onContextMenu={onMenu}
      className={`${cardBase} flex flex-col overflow-hidden ${cardState(selected)}`}
    >
      <div className="flex h-36 items-center justify-center overflow-hidden border-b border-border bg-background">
        {kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl(node, true, linkToken)} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
        ) : (
          <FileIcon type="FILE" mimeType={node.mimeType} name={node.name} size={40} />
        )}
      </div>
      <div className="flex items-start gap-2 px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{node.name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
            <span className="font-mono">{formatBytes(node.size)}</span>
            <span>·</span>
            <DateText iso={node.updatedAt} />
            {node.starred && <Star size={11} className="fill-current text-primary" aria-label="Starred" />}
            {node.shared && <Users size={11} aria-label="Shared" />}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMenu(e);
          }}
          className="-mr-1 rounded-md p-1 text-muted opacity-0 hover:bg-hover hover:text-foreground group-hover:opacity-100"
          aria-label="More actions"
        >
          <MoreHorizontal size={16} />
        </button>
      </div>
    </div>
  );
}

function Empty({ view, canWrite, text, onUpload }: { view: View; canWrite: boolean; text?: string; onUpload: () => void }) {
  const messages: Record<View, string> = {
    drive: "Drop files here, or use New to upload and create folders.",
    shared: "Files and folders others share with you will show up here.",
    recent: "Files you open or upload will show up here.",
    starred: "Star things you want to find quickly.",
    trash: "The trash is empty.",
    search: "No results found.",
    public: "This folder is empty.",
  };
  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <div className="rounded-full border border-border bg-surface p-5 text-muted">
        <CloudUpload size={28} />
      </div>
      <p className="max-w-xs text-sm text-muted">{text ?? messages[view]}</p>
      {canWrite && (
        <Button onClick={onUpload} variant="outline">
          <Upload size={14} /> Upload files
        </Button>
      )}
    </div>
  );
}
