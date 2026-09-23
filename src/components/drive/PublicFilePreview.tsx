"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { PreviewModal } from "@/components/drive/modals/PreviewModal";
import { previewKind } from "@/lib/format";
import type { NodeDTO } from "@/lib/nodes";

/** "Preview" button + modal for a single publicly shared file. */
export function PublicFilePreview({ node, token }: { node: NodeDTO; token: string }) {
  const [open, setOpen] = useState(false);
  if (previewKind(node.mimeType, node.name) === "none") return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-md border border-border-strong px-5 py-2.5 text-sm font-medium hover:bg-hover"
      >
        <Eye size={16} /> Preview
      </button>
      <PreviewModal node={open ? node : null} siblings={[node]} linkToken={token} onClose={() => setOpen(false)} onNavigate={() => {}} />
    </>
  );
}
