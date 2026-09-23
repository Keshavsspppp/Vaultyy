import { prisma } from "@/lib/prisma";
import type { Node } from "@/generated/prisma/client";

export type Role = "OWNER" | "EDITOR" | "VIEWER";

const RANK: Record<Role, number> = { VIEWER: 1, EDITOR: 2, OWNER: 3 };

export function roleAtLeast(role: Role | null, min: Role): role is Role {
  return !!role && RANK[role] >= RANK[min];
}

/** Walks from `node` up to the root, returning the chain [node, parent, grandparent, ...]. */
export async function getAncestry(node: Node): Promise<Node[]> {
  const chain: Node[] = [node];
  let cur = node;
  while (cur.parentId) {
    const parent = await prisma.node.findUnique({ where: { id: cur.parentId } });
    if (!parent) break;
    chain.push(parent);
    cur = parent;
  }
  return chain;
}

/**
 * Resolves the effective role of `userId` (or an anonymous link visitor) on a node.
 * Access is inherited: a share on any ancestor grants access to descendants.
 */
export async function getAccess(
  node: Node,
  userId: string | null,
  linkToken?: string | null,
): Promise<{ role: Role | null; ancestry: Node[] }> {
  const ancestry = await getAncestry(node);
  if (ancestry.some((n) => n.trashedAt) && node.ownerId !== userId) {
    return { role: null, ancestry }; // trashed items are only visible to their owner
  }
  if (userId && node.ownerId === userId) return { role: "OWNER", ancestry };

  const ids = ancestry.map((n) => n.id);
  let best: Role | null = null;

  if (userId) {
    const shares = await prisma.share.findMany({ where: { userId, nodeId: { in: ids } } });
    for (const s of shares) if (!best || RANK[s.role as Role] > RANK[best]) best = s.role as Role;
  }
  if (linkToken) {
    const link = await prisma.shareLink.findUnique({ where: { token: linkToken } });
    if (link && ids.includes(link.nodeId)) {
      const r = link.role as Role;
      if (!best || RANK[r] > RANK[best]) best = r;
    }
  }
  return { role: best, ancestry };
}

/**
 * Breadcrumb trail for a node as seen by `userId`: stops at the highest ancestor
 * the user can still access (so shared folders do not leak the owner tree).
 */
export async function getVisibleBreadcrumb(ancestry: Node[], userId: string | null, linkToken?: string | null) {
  const trail: { id: string; name: string }[] = [];
  for (const n of ancestry) {
    if (n.ownerId === userId) {
      trail.push({ id: n.id, name: n.name });
      continue;
    }
    const { role } = await getAccess(n, userId, linkToken);
    if (!role) break;
    trail.push({ id: n.id, name: n.name });
  }
  return trail.reverse();
}

/** Returns true if `candidateId` is `nodeId` itself or one of its descendants. */
export async function isSelfOrDescendant(nodeId: string, candidateId: string | null): Promise<boolean> {
  let cur = candidateId;
  while (cur) {
    if (cur === nodeId) return true;
    const n = await prisma.node.findUnique({ where: { id: cur }, select: { parentId: true } });
    cur = n?.parentId ?? null;
  }
  return false;
}
