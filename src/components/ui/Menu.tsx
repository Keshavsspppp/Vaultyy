"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type MenuItem =
  | { type: "separator" }
  | { label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean };

type Props = {
  /** Screen position to anchor the menu at (top-left). */
  position: { x: number; y: number } | null;
  items: MenuItem[];
  onClose: () => void;
};

/** Floating menu for right-click / overflow actions. Keeps itself inside the viewport. */
export function Menu({ position, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(position);

  useLayoutEffect(() => {
    if (!position || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = Math.min(position.x, window.innerWidth - rect.width - 8);
    const y = Math.min(position.y, window.innerHeight - rect.height - 8);
    setPos({ x: Math.max(8, x), y: Math.max(8, y) });
  }, [position]);

  useEffect(() => {
    if (!position) return;
    const close = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
    };
  }, [position, onClose]);

  if (!position) return null;

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-[220px] rounded-md border border-border bg-surface py-1.5 shadow-[0_16px_40px_-16px_rgba(31,27,22,0.4)] animate-fade-in"
      style={{ left: pos?.x ?? position.x, top: pos?.y ?? position.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) =>
        "type" in it ? (
          <div key={i} className="my-1.5 border-t border-border" />
        ) : (
          <button
            key={i}
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onSelect();
            }}
            className={`flex w-full items-center gap-3 px-3.5 py-2 text-left text-sm hover:bg-hover disabled:opacity-40 disabled:hover:bg-transparent ${it.danger ? "text-danger" : ""}`}
          >
            <span className="w-4 text-muted [&>svg]:h-4 [&>svg]:w-4">{it.icon}</span>
            {it.label}
          </button>
        ),
      )}
    </div>
  );
}
