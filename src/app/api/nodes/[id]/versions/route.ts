import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";
import { auth, HttpError, requireUserId } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { loadNode } from "@/lib/load-node";
import { getStorage } from "@/lib/storage";
import { QUOTA_BYTES } from "@/lib/nodes";
import { listVersions, toVersionDTO, VERSION_LIMIT } from "@/lib/versions";

type Ctx = { params: Promise<{ id: string }> };

/** Version history of a file (newest first). Share-link visitors may pass `?token=`. */
export const GET = route(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const token = new URL(req.url).searchParams.get("token");
  const session = await auth();
  const { node, role } = await loadNode(id, session?.user?.id ?? null, "VIEWER", token);
  if (node.type !== "FILE") throw new HttpError(400, "Folders do not have versions");
  const versions = await listVersions(id);
  return NextResponse.json({
    versions: versions.map((v) => toVersionDTO(v, node.currentVersion)),
    role,
    limit: VERSION_LIMIT,
  });
});

const pendingPlaceholder = () => -(1 + Math.floor(Math.random() * 2_000_000_000));

const initSchema = z.object({
  size: z.number().int().nonnegative().max(2_000_000_000),
  mimeType: z.string().max(255).optional(),
});

/**
 * Step 1 of uploading a new version: reserve a pending FileVersion and return the
 * URL to PUT bytes to (presigned S3 URL, or the local upload route).
 */
export const POST = route(async (req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  await rateLimit("upload", userId);
  const { id } = await params;
  const { size, mimeType } = initSchema.parse(await req.json());
  const { node } = await loadNode(id, userId, "EDITOR");
  if (node.type !== "FILE" || !node.uploadComplete) throw new HttpError(400, "Not an uploaded file");

  const owner = await prisma.user.findUniqueOrThrow({ where: { id: node.ownerId } });
  if (owner.storageUsed + size > QUOTA_BYTES) throw new HttpError(413, "Not enough storage space");

  const mime = mimeType || node.mimeType || "application/octet-stream";
  const storageKey = `${node.ownerId}/${randomUUID()}`;
  const pending = await prisma.fileVersion.create({
    // The real version number is assigned on completion so concurrent uploads never collide;
    // until then the row carries a random negative placeholder to satisfy the unique index.
    data: { nodeId: id, version: pendingPlaceholder(), storageKey, size, mimeType: mime, pending: true, createdById: userId },
  });
  const uploadUrl = await getStorage().getUploadUrl(storageKey, mime, size);
  return NextResponse.json({ versionId: pending.id, uploadUrl, contentType: mime });
});
