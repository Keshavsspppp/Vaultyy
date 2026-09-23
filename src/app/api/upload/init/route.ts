import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";
import { HttpError, requireUserId } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { loadNode } from "@/lib/load-node";
import { getStorage } from "@/lib/storage";
import { QUOTA_BYTES } from "@/lib/nodes";

const schema = z.object({
  name: z.string().trim().min(1).max(255),
  size: z.number().int().nonnegative().max(2_000_000_000),
  mimeType: z.string().max(255).optional(),
  parentId: z.string().nullable().optional(),
});

/**
 * Step 1 of an upload: reserve a node row and hand the browser a URL to PUT bytes to.
 * With S3 that is a presigned URL (bytes never touch this server); with local
 * storage it is /api/upload/local/<key>.
 */
export const POST = route(async (req: Request) => {
  const userId = await requireUserId();
  await rateLimit("upload", userId);
  const { name, size, parentId, mimeType } = schema.parse(await req.json());
  const mime = mimeType || "application/octet-stream";

  let ownerId = userId;
  if (parentId) {
    const { node: parent } = await loadNode(parentId, userId, "EDITOR");
    if (parent.type !== "FOLDER") throw new HttpError(400, "Parent is not a folder");
    ownerId = parent.ownerId;
  }

  const owner = await prisma.user.findUniqueOrThrow({ where: { id: ownerId } });
  if (owner.storageUsed + size > QUOTA_BYTES) throw new HttpError(413, "Not enough storage space");

  const storageKey = `${ownerId}/${randomUUID()}`;
  const node = await prisma.node.create({
    data: { name, type: "FILE", mimeType: mime, size, storageKey, uploadComplete: false, parentId: parentId ?? null, ownerId },
  });

  const uploadUrl = await getStorage().getUploadUrl(storageKey, mime, size);
  return NextResponse.json({ nodeId: node.id, uploadUrl, contentType: mime });
});
