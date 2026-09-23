export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear() ? { month: "short", day: "numeric" } : { year: "numeric", month: "short", day: "numeric" };
  return d.toLocaleDateString(undefined, opts);
}

export type PreviewKind = "image" | "video" | "audio" | "pdf" | "text" | "none";

export function previewKind(mime: string | null, name: string): PreviewKind {
  const m = mime ?? "";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m === "application/pdf" || name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (
    m.startsWith("text/") ||
    ["application/json", "application/javascript", "application/xml", "application/x-sh"].includes(m) ||
    /\.(md|txt|json|js|ts|tsx|jsx|css|html|yml|yaml|csv|log|py|sh|env|toml|xml)$/i.test(name)
  )
    return "text";
  return "none";
}
