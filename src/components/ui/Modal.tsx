"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Tailwind width class, e.g. "max-w-lg". */
  width?: string;
  bare?: boolean; // no padding / header — used for previews
};

export function Modal({ open, onClose, title, children, footer, width = "max-w-md", bare }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${bare ? "bg-ink-overlay" : "bg-foreground/30 backdrop-blur-[2px]"} p-4`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      {bare ? (
        children
      ) : (
        <div className={`w-full ${width} rounded-lg border border-border bg-surface shadow-[0_24px_60px_-20px_rgba(31,27,22,0.35)] animate-fade-in`}>
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 pt-5 pb-4">
            <h2 className="font-display text-[22px] leading-tight">{title}</h2>
            <button onClick={onClose} className="-mr-2 -mt-1 rounded-md p-2 text-muted hover:bg-hover hover:text-foreground" aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <div className="px-6 py-5">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>}
        </div>
      )}
    </div>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: { variant?: "primary" | "text" | "outline" | "danger" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles = {
    primary: "bg-foreground text-background hover:bg-primary",
    text: "text-foreground hover:bg-hover",
    outline: "border border-border-strong bg-transparent hover:bg-hover",
    danger: "bg-danger text-background hover:brightness-110",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none ${styles} ${className}`}
    />
  );
}

export function TextInput(props: React.ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={`w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted focus:border-foreground ${props.className ?? ""}`}
    />
  );
}
