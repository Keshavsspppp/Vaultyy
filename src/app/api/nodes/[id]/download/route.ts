import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";
import { auth, HttpError } from "@/lib/auth";
import { loadNode } from "@/lib/load-node";
import { getStorage } from "@/lib/storage";
import { zipResponse } from "@/lib/zip";

/**
 * Downloads (or previews with `?inline=1`) a file, or a folder as a zip. Works for
 * the owner, users it is shared with, and anonymous visitors carrying a valid `?token=`.
 */
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const url = new URL(req.url);
  const inline = url.searchParams.get("inline") === "1";
  const token = url.searchParams.get("token");
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const { node } = await loadNode(id, userId, "VIEWER", token);
  if (node.type === "FOLDER") return zipResponse([node], `${node.name}.zip`);
  if (!node.storageKey || !node.uploadComplete) {
    throw new HttpError(400, "Not a downloadable file");
  }

  if (userId) {
    // Feeds the "Recent" view; fire-and-forget.
    prisma.node.update({ where: { id }, data: { lastAccessedAt: new Date() } }).catch(() => {});
  }

  const storage = getStorage();
  const mime = node.mimeType || "application/octet-stream";
  const signed = await storage.getDownloadUrl(node.storageKey, node.name, mime, inline);
  if (signed) return NextResponse.redirect(signed, 302);

  const stream = await storage.getStream(node.storageKey);
  const disposition = `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(node.name)}`;
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(node.size),
      "Content-Disposition": disposition,
      "Cache-Control": "private, max-age=0",
    },
  });
});
