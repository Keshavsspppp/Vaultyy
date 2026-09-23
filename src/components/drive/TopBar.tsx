"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { Search, LogOut, Menu as MenuIcon, Plus, FolderPlus, Upload, FolderUp } from "lucide-react";
import { Wordmark } from "@/components/Logo";
import { Avatar } from "@/components/drive/modals/ShareModal";
import { useDrive } from "@/components/drive/DriveContext";
import { useUpload } from "@/components/drive/UploadProvider";
import { Menu } from "@/components/ui/Menu";
import { NameModal } from "@/components/drive/modals/NameModal";
import { api } from "@/lib/client";

/** Masthead: wordmark, command-bar style search, "New" action and the account menu. */
export function TopBar({ user }: { user: { name: string; email: string; image?: string | null } }) {
  const router = useRouter();
  const params = useSearchParams();
  const { sidebarOpen, setSidebarOpen, current, toast } = useDrive();
  const { pick } = useUpload();
  const paramQ = params.get("q") ?? "";
  const [q, setQ] = useState(paramQ);
  const [open, setOpen] = useState(false);
  const [newMenu, setNewMenu] = useState<{ x: number; y: number } | null>(null);
  const [newFolder, setNewFolder] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Keep the box in sync when the URL query changes (e.g. back/forward).
  const [prevParamQ, setPrevParamQ] = useState(paramQ);
  if (paramQ !== prevParamQ) {
    setPrevParamQ(paramQ);
    setQ(paramQ);
  }

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  // "/" focuses search from anywhere (unless typing already).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "/" && !(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/files/search?q=${encodeURIComponent(term)}` : "/files");
  }

  // The New button targets the folder currently open, or the root elsewhere.
  const targetFolder = current.canWrite ? current.folderId : null;

  return (
    <header className="flex h-16 items-center gap-3 border-b border-border px-4 sm:px-6">
      <button onClick={() => setSidebarOpen(!sidebarOpen)} className="rounded-md p-2 hover:bg-hover md:hidden" aria-label="Open navigation">
        <MenuIcon size={20} />
      </button>
      <Link href="/files" className="shrink-0 md:w-52">
        <Wordmark />
      </Link>

      <form onSubmit={submit} className="mx-auto w-full max-w-xl">
        <label className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2 transition-colors focus-within:border-foreground">
          <Search size={16} className="shrink-0 text-muted" />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search files…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
          />
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted sm:inline">/</kbd>
        </label>
      </form>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setNewMenu({ x: r.right - 220, y: r.bottom + 6 });
          }}
          className="inline-flex items-center gap-2 rounded-md bg-foreground px-3.5 py-2 text-sm font-medium text-background transition-colors hover:bg-primary"
        >
          <Plus size={16} /> <span className="hidden sm:inline">New</span>
        </button>
        <Menu
          position={newMenu}
          onClose={() => setNewMenu(null)}
          items={[
            { label: "New folder", icon: <FolderPlus />, onSelect: () => setNewFolder(true) },
            { type: "separator" },
            { label: "Upload files", icon: <Upload />, onSelect: () => pick({}, targetFolder) },
            { label: "Upload folder", icon: <FolderUp />, onSelect: () => pick({ directory: true }, targetFolder) },
          ]}
        />
        <NameModal
          open={newFolder}
          title="New folder"
          initial="Untitled folder"
          submitLabel="Create"
          onClose={() => setNewFolder(false)}
          onSubmit={async (name) => {
            await api("/api/nodes", { method: "POST", body: { name, parentId: targetFolder } });
            toast(`Folder "${name}" created`);
            if (!current.canWrite) router.push("/files");
            router.refresh();
          }}
        />

        <div className="relative" ref={menuRef}>
          <button onClick={() => setOpen((o) => !o)} className="rounded-full p-0.5 ring-border hover:ring-2" aria-label="Account menu">
            <Avatar name={user.name} image={user.image} size={32} />
          </button>
          {open && (
            <div className="absolute right-0 z-40 mt-2 w-64 rounded-lg border border-border bg-surface p-4 shadow-[0_16px_40px_-16px_rgba(31,27,22,0.4)] animate-fade-in">
              <div className="flex items-center gap-3 pb-3">
                <Avatar name={user.name} image={user.image} size={40} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{user.name}</div>
                  <div className="truncate text-xs text-muted">{user.email}</div>
                </div>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-border-strong py-2 text-sm hover:bg-hover"
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
