import type { FileVersion, Node } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import { HttpError } from "@/lib/errors";
import { QUOTA_BYTES } from "@/lib/nodes";

/** How many versions of a file to keep; the oldest non-current ones are pruned beyond this. */
export const VERSION_LIMIT = Math.max(1, Number(process.env.FILE_VERSION_LIMIT || 25));

export type VersionDTO = {
  id: string;
  version: number;
  size: number;
  mimeType: string | null;
  createdAt: string;
  createdBy: string | null;
  current: boolean;
};

export function toVersionDTO(v: FileVersion & { createdBy?: { name: string } | null }, current: number): VersionDTO {
  return {
    id: v.id,
    version: v.version,
    size: v.size,
    mimeType: v.mimeType,
    createdAt: v.createdAt.toISOString(),
    createdBy: v.createdBy?.name ?? null,
    current: v.version === current,
  };
}

export function listVersions(nodeId: string) {
  return prisma.fileVersion.findMany({
    where: { nodeId, pending: false },
    include: { createdBy: { select: { name: true } } },
    orderBy: { version: "desc" },
  });
}

/**
 * Records the first version of a freshly uploaded file. Called by upload/complete
 * once the bytes are verified, inside the same transaction that publishes the node.
 */
export function firstVersionData(node: Node, size: number, userId: string) {
  return {
    nodeId: node.id,
    version: 1,
    storageKey: node.storageKey!,
    size,
    mimeType: node.mimeType,
    createdById: userId,
  };
}

/**
 * Publishes a pending version after its bytes are verified: assigns the next
 * version number, makes it current on the node, charges quota, prunes old versions.
 */
export async function publishVersion(node: Node, pending: FileVersion, actualSize: number) {
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: node.ownerId } });
  if (owner.storageUsed + actualSize > QUOTA_BYTES) {
    await getStorage().delete(pending.storageKey).catch(() => {});
    await prisma.fileVersion.delete({ where: { id: pending.id } });
    throw new HttpError(413, "Not enough storage space");
  }

  const latest = await prisma.fileVersion.aggregate({ where: { nodeId: node.id }, _max: { version: true } });
  const version = (latest._max.version ?? 0) + 1;

  const [published] = await prisma.$transaction([
    prisma.fileVersion.update({ where: { id: pending.id }, data: { pending: false, version, size: actualSize } }),
    prisma.node.update({
      where: { id: node.id },
      data: {
        storageKey: pending.storageKey,
        size: actualSize,
        mimeType: pending.mimeType ?? node.mimeType,
        currentVersion: version,
        lastAccessedAt: new Date(),
      },
    }),
    prisma.user.update({ where: { id: node.ownerId }, data: { storageUsed: { increment: actualSize } } }),
  ]);

  await pruneVersions(node.id, version);
  return published;
}

/** Drops the oldest non-current versions beyond VERSION_LIMIT, freeing storage and quota. */
export async function pruneVersions(nodeId: string, currentVersion: number) {
  const all = await prisma.fileVersion.findMany({ where: { nodeId, pending: false }, orderBy: { version: "desc" } });
  const excess = all.slice(VERSION_LIMIT).filter((v) => v.version !== currentVersion);
  for (const v of excess) await deleteVersion(v);
}

/** Permanently removes one version (never the current one — callers check that). */
export async function deleteVersion(v: FileVersion) {
  const node = await prisma.node.findUniqueOrThrow({ where: { id: v.nodeId }, select: { ownerId: true } });
  await getStorage().delete(v.storageKey).catch(() => {});
  await prisma.$transaction([
    prisma.fileVersion.delete({ where: { id: v.id } }),
    ...(v.pending ? [] : [prisma.user.update({ where: { id: node.ownerId }, data: { storageUsed: { decrement: v.size } } })]),
  ]);
}

/** Makes an older version current again (no copy; the node just points at it). */
export async function restoreVersion(node: Node, v: FileVersion) {
  return prisma.node.update({
    where: { id: node.id },
    data: { storageKey: v.storageKey, size: v.size, mimeType: v.mimeType ?? node.mimeType, currentVersion: v.version },
  });
}
