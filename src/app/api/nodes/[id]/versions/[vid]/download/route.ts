import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";
import { auth, HttpError } from "@/lib/auth";
import { loadNode } from "@/lib/load-node";
import { getStorage } from "@/lib/storage";

/** Downloads (or previews with `?inline=1`) a specific version of a file. */
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string; vid: string }> }) => {
  const { id, vid } = await params;
  const url = new URL(req.url);
  const inline = url.searchParams.get("inline") === "1";
  const token = url.searchParams.get("token");
  const session = await auth();
  const { node } = await loadNode(id, session?.user?.id ?? null, "VIEWER", token);

  const v = await prisma.fileVersion.findUnique({ where: { id: vid } });
  if (!v || v.nodeId !== id || v.pending) throw new HttpError(404, "Unknown version");

  const storage = getStorage();
  const mime = v.mimeType || node.mimeType || "application/octet-stream";
  // Versioned downloads carry the version number in the filename, e.g. "report (v3).pdf".
  const dot = node.name.lastIndexOf(".");
  const filename = dot > 0 ? `${node.name.slice(0, dot)} (v${v.version})${node.name.slice(dot)}` : `${node.name} (v${v.version})`;

  const signed = await storage.getDownloadUrl(v.storageKey, filename, mime, inline);
  if (signed) return NextResponse.redirect(signed, 302);

  const stream = await storage.getStream(v.storageKey);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(v.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, max-age=0",
    },
  });
});
