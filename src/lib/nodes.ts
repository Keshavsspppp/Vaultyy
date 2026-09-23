import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import type { Node } from "@/generated/prisma/client";
import { parseTags } from "@/lib/ai-tags";

/** Shape sent to the client for every file/folder. */
export type NodeDTO = {
  id: string;
  name: string;
  type: "FILE" | "FOLDER";
  mimeType: string | null;
  size: number;
  starred: boolean;
  trashedAt: string | null;
  parentId: string | null;
  ownerId: string;
  ownerName?: string;
  updatedAt: string;
  createdAt: string;
  lastAccessedAt: string;
  shared: boolean;
  role: "OWNER" | "EDITOR" | "VIEWER";
  /** Current version number (files only). */
  version: number;
  ai: { status: string | null; summary: string | null; tags: string[]; version: number | null };
};

export function toDTO(
  n: Node & { owner?: { name: string }; _count?: { shares: number }; shareLink?: { id: string } | null },
  role: NodeDTO["role"] = "OWNER",
): NodeDTO {
  return {
    id: n.id,
    name: n.name,
    type: n.type as "FILE" | "FOLDER",
    mimeType: n.mimeType,
    size: n.size,
    starred: n.starred,
    trashedAt: n.trashedAt?.toISOString() ?? null,
    parentId: n.parentId,
    ownerId: n.ownerId,
    ownerName: n.owner?.name,
    updatedAt: n.updatedAt.toISOString(),
    createdAt: n.createdAt.toISOString(),
    lastAccessedAt: n.lastAccessedAt.toISOString(),
    shared: (n._count?.shares ?? 0) > 0 || !!n.shareLink,
    role,
    version: n.currentVersion,
    ai: { status: n.aiStatus, summary: n.aiSummary, tags: parseTags(n.aiTags), version: n.aiVersion },
  };
}

export const nodeInclude = {
  owner: { select: { name: true } },
  _count: { select: { shares: true } },
  shareLink: { select: { id: true } },
} as const;

/** All descendant ids of a node (excluding itself), breadth-first. */
export async function collectDescendantIds(rootId: string): Promise<string[]> {
  const out: string[] = [];
  let frontier = [rootId];
  while (frontier.length) {
    const kids = await prisma.node.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
    const ids = kids.map((k) => k.id);
    out.push(...ids);
    frontier = ids;
  }
  return out;
}

/** Permanently deletes a node subtree: removes every stored version, frees quota, deletes rows. */
export async function hardDelete(root: Node) {
  const ids = [root.id, ...(await collectDescendantIds(root.id))];
  const files = await prisma.node.findMany({
    where: { id: { in: ids }, type: "FILE" },
    select: { storageKey: true, size: true, ownerId: true, uploadComplete: true, versions: true },
  });
  const storage = getStorage();
  const freed = new Map<string, number>();
  for (const f of files) {
    // Files uploaded before versioning existed may carry only the node-level key.
    const keys = new Set([f.storageKey, ...f.versions.map((v) => v.storageKey)].filter((k): k is string => !!k));
    for (const key of keys) await storage.delete(key).catch(() => {});
    const bytes = f.versions.length ? f.versions.filter((v) => !v.pending).reduce((n, v) => n + v.size, 0) : f.uploadComplete ? f.size : 0;
    freed.set(f.ownerId, (freed.get(f.ownerId) ?? 0) + bytes);
  }
  await prisma.$transaction([
    ...[...freed].map(([ownerId, bytes]) =>
      prisma.user.update({ where: { id: ownerId }, data: { storageUsed: { decrement: bytes } } }),
    ),
    prisma.node.delete({ where: { id: root.id } }), // children cascade
  ]);
}

export const QUOTA_BYTES = Number(process.env.STORAGE_QUOTA_BYTES || 1024 * 1024 * 1024);
