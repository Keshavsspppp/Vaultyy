import Link from "next/link";
import { FolderX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <div className="rounded-full border border-border bg-surface p-6 text-muted">
        <FolderX size={36} />
      </div>
      <h1 className="font-display text-2xl">Nothing here</h1>
      <p className="max-w-sm text-sm text-muted">This item does not exist, or you do not have access to it.</p>
      <Link href="/files" className="text-sm font-medium text-primary underline underline-offset-4">
        Back to all files
      </Link>
    </div>
  );
}
