import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";
import { HttpError, requireUserId } from "@/lib/auth";
import { loadNode } from "@/lib/load-node";
import { getLocalStorage } from "@/lib/storage";

/**
 * Receives raw upload bytes when local-disk storage is active (S3 uploads go
 * straight to the bucket via a presigned URL and never hit this route).
 */
export const PUT = route(async (req: Request, { params }: { params: Promise<{ key: string }> }) => {
  const userId = await requireUserId();
  const key = decodeURIComponent((await params).key);

  // The key belongs either to a brand-new file or to a new version of an existing one.
  const pendingNode = await prisma.node.findUnique({ where: { storageKey: key } });
  const pendingVersion = pendingNode ? null : await prisma.fileVersion.findUnique({ where: { storageKey: key } });
  const nodeId = pendingNode && !pendingNode.uploadComplete ? pendingNode.id : pendingVersion?.pending ? pendingVersion.nodeId : null;
  if (!nodeId) throw new HttpError(404, "No pending upload for this key");
  await loadNode(nodeId, userId, "EDITOR");
  if (!req.body) throw new HttpError(400, "Empty body");

  await getLocalStorage().write(key, req.body);
  return NextResponse.json({ ok: true });
});
