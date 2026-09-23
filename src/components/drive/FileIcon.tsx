import {
  Folder,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  FileArchive,
  FileCode2,
  FileSpreadsheet,
  Presentation,
  File as FileGeneric,
  type LucideProps,
} from "lucide-react";

type Props = { type: "FILE" | "FOLDER"; mimeType?: string | null; name: string; size?: number; className?: string };

/** Picks an icon + a muted, warm-palette color for a node based on its mime type / extension. */
export function FileIcon({ type, mimeType, name, size = 24, className = "" }: Props) {
  const { Icon, color } = pick(type, mimeType ?? "", name);
  const props: LucideProps = { size, className, style: { color }, "aria-hidden": true };
  return <Icon {...props} />;
}

export function iconColor(type: "FILE" | "FOLDER", mimeType: string | null, name: string) {
  return pick(type, mimeType ?? "", name).color;
}

function pick(type: "FILE" | "FOLDER", mime: string, name: string) {
  if (type === "FOLDER") return { Icon: Folder, color: "var(--muted)" };
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (mime.startsWith("image/")) return { Icon: ImageIcon, color: "var(--primary)" };
  if (mime.startsWith("video/")) return { Icon: Film, color: "var(--primary)" };
  if (mime.startsWith("audio/")) return { Icon: Music, color: "var(--primary)" };
  if (mime === "application/pdf" || ext === "pdf") return { Icon: FileText, color: "var(--primary)" };
  if (/(zip|rar|7z|gz|tar|bz2)$/.test(ext) || mime.includes("zip") || mime.includes("compressed"))
    return { Icon: FileArchive, color: "var(--muted)" };
  if (/(xls|xlsx|csv|ods)$/.test(ext) || mime.includes("spreadsheet") || mime.includes("excel"))
    return { Icon: FileSpreadsheet, color: "#4f6b3a" };
  if (/(ppt|pptx|odp|key)$/.test(ext) || mime.includes("presentation")) return { Icon: Presentation, color: "#b0761a" };
  if (/(doc|docx|odt|rtf)$/.test(ext) || mime.includes("word") || mime.includes("document"))
    return { Icon: FileText, color: "#3f5f8a" };
  if (/(js|jsx|ts|tsx|py|java|c|cpp|cs|go|rs|rb|php|sh|json|xml|yml|yaml|html|css|sql|toml)$/.test(ext))
    return { Icon: FileCode2, color: "var(--muted)" };
  if (mime.startsWith("text/") || /(txt|md|log)$/.test(ext)) return { Icon: FileText, color: "#3f5f8a" };
  return { Icon: FileGeneric, color: "var(--muted)" };
}
