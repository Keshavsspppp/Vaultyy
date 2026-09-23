"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

export type Layout = "grid" | "list";

type Current = { folderId: string | null; canWrite: boolean; section?: "drive" | "shared" };

type DriveContextValue = {
  current: Current;
  setCurrent: (c: Current) => void;
  layout: Layout;
  setLayout: (l: Layout) => void;
  toast: (message: string, opts?: { error?: boolean }) => void;
  /** Mobile navigation drawer. */
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  /** Whether Groq-backed AI features are configured on the server. */
  aiEnabled: boolean;
};

const DriveContext = createContext<DriveContextValue | null>(null);

type Toast = { id: number; message: string; error: boolean };

// Grid/list preference lives in localStorage and is exposed as an external store
// so server and client render the same default without a post-mount flash.
const LAYOUT_KEY = "drive:layout";
const listeners = new Set<() => void>();
function subscribeLayout(fn: () => void) {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
}
function readLayout(): Layout {
  try {
    const v = localStorage.getItem(LAYOUT_KEY);
    return v === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

export function DriveProvider({ children, aiEnabled = false }: { children: ReactNode; aiEnabled?: boolean }) {
  const [current, setCurrent] = useState<Current>({ folderId: null, canWrite: false });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const layout = useSyncExternalStore(subscribeLayout, readLayout, () => "grid" as Layout);

  const setLayout = useCallback((l: Layout) => {
    try {
      localStorage.setItem(LAYOUT_KEY, l);
    } catch {}
    listeners.forEach((fn) => fn());
  }, []);

  const toast = useCallback((message: string, opts?: { error?: boolean }) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, error: !!opts?.error }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const value = useMemo(
    () => ({ current, setCurrent, layout, setLayout, toast, sidebarOpen, setSidebarOpen, aiEnabled }),
    [current, layout, setLayout, toast, sidebarOpen, aiEnabled],
  );

  return (
    <DriveContext.Provider value={value}>
      {children}
      <div className="fixed bottom-6 left-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`animate-fade-in rounded-md px-4 py-3 text-sm text-background shadow-lg ${t.error ? "bg-danger" : "bg-foreground"}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </DriveContext.Provider>
  );
}

export function useDrive() {
  const ctx = useContext(DriveContext);
  if (!ctx) throw new Error("useDrive must be used inside DriveProvider");
  return ctx;
}
