"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock, Files, Star, Trash2, Users } from "lucide-react";
import { useDrive } from "@/components/drive/DriveContext";
import { formatBytes } from "@/lib/format";

type Section = "drive" | "shared" | undefined;

// A folder page belongs to "All files" or "Shared" depending on who owns it.
const NAV = [
  { href: "/files", label: "All files", icon: Files, match: (p: string, s: Section) => p === "/files" || (p.startsWith("/files/folder") && s !== "shared") },
  { href: "/files/shared", label: "Shared", icon: Users, match: (p: string, s: Section) => p === "/files/shared" || (p.startsWith("/files/folder") && s === "shared") },
  { href: "/files/recent", label: "Recent", icon: Clock, match: (p: string) => p === "/files/recent" },
  { href: "/files/starred", label: "Starred", icon: Star, match: (p: string) => p === "/files/starred" },
  { href: "/files/trash", label: "Trash", icon: Trash2, match: (p: string) => p === "/files/trash" },
];

/** Left rail: icon + label navigation and the storage meter. Slides in as a drawer on small screens. */
export function Sidebar({ storageUsed, quota }: { storageUsed: number; quota: number }) {
  const pathname = usePathname();
  const { current, sidebarOpen, setSidebarOpen } = useDrive();
  const pct = Math.min(100, Math.round((storageUsed / quota) * 100));

  return (
    <>
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-foreground/30 md:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-56 flex-col border-r border-border bg-background transition-transform md:static md:w-52 md:translate-x-0 ${
          sidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        <nav className="flex flex-col gap-0.5 px-3 pt-5">
          <p className="eyebrow mb-2 px-3">Library</p>
          {NAV.map(({ href, label, icon: Icon, match }) => {
            const active = match(pathname, current.section);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setSidebarOpen(false)}
                className={`group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  active ? "bg-foreground text-background" : "text-foreground hover:bg-hover"
                }`}
              >
                <Icon size={16} className={active ? "text-background" : "text-muted group-hover:text-foreground"} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-border px-6 py-5">
          <p className="eyebrow mb-3">Storage</p>
          <div className="h-1 w-full rounded-full bg-surface-2">
            <div className={`h-full rounded-full ${pct >= 90 ? "bg-danger" : "bg-foreground"}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">
            <span className="font-medium text-foreground">{formatBytes(storageUsed)}</span> of {formatBytes(quota)}
          </p>
        </div>
      </aside>
    </>
  );
}
