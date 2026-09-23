import type { Node, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getAncestry, getVisibleBreadcrumb, type Role } from "@/lib/access";
import { loadNode } from "@/lib/load-node";
import { collectDescendantIds, nodeInclude, toDTO, type NodeDTO } from "@/lib/nodes";

type Full = Prisma.NodeGetPayload<{ include: typeof nodeInclude }>;

const live = { trashedAt: null, uploadComplete: true } as const;
const order: Prisma.NodeOrderByWithRelationInput[] = [{ type: "desc" }, { name: "asc" }]; // folders first

/** Drops nodes that live inside a trashed folder (their own trashedAt is null). */
async function withoutTrashedAncestors<T extends Node>(nodes: T[]): Promise<T[]> {
  const out: T[] = [];
  for (const n of nodes) {
    const chain = await getAncestry(n);
    if (!chain.some((a) => a.trashedAt)) out.push(n);
  }
  return out;
}

/** Contents of root, or of any folder the user can access (own or shared). */
export async function listFolder(userId: string | null, folderId: string | null, linkToken?: string | null) {
  let role: Role = "OWNER";
  let breadcrumb: { id: string; name: string }[] = [];
  let folder: Node | null = null;

  if (folderId) {
    const loaded = await loadNode(folderId, userId, "VIEWER", linkToken);
    if (loaded.node.type !== "FOLDER") throw new Error("Not a folder");
    role = loaded.role;
    folder = loaded.node;
    breadcrumb = await getVisibleBreadcrumb(loaded.ancestry, userId, linkToken);
  }

  const where: Prisma.NodeWhereInput = folderId ? { parentId: folderId, ...live } : { ownerId: userId!, parentId: null, ...live };
  const rows = await prisma.node.findMany({ where, include: nodeInclude, orderBy: order });
  return { items: rows.map((r) => toDTO(r, role)), role, breadcrumb, folder };
}

export async function listShared(userId: string): Promise<NodeDTO[]> {
  const shares = await prisma.share.findMany({
    where: { userId, node: live },
    include: { node: { include: nodeInclude } },
    orderBy: { createdAt: "desc" },
  });
  const nodes = await withoutTrashedAncestors(shares.map((s) => Object.assign(s.node, { _role: s.role })));
  return nodes.map((n) => toDTO(n as Full, n._role as Role));
}

export async function listRecent(userId: string): Promise<NodeDTO[]> {
  const rows = await prisma.node.findMany({
    where: { ownerId: userId, type: "FILE", ...live },
    include: nodeInclude,
    orderBy: { lastAccessedAt: "desc" },
    take: 60,
  });
  return (await withoutTrashedAncestors(rows)).map((r) => toDTO(r));
}

export async function listStarred(userId: string): Promise<NodeDTO[]> {
  const rows = await prisma.node.findMany({ where: { ownerId: userId, starred: true, ...live }, include: nodeInclude, orderBy: order });
  return (await withoutTrashedAncestors(rows)).map((r) => toDTO(r));
}

/** Top-level trashed items (children of a trashed folder are hidden under it). */
export async function listTrash(userId: string): Promise<NodeDTO[]> {
  const rows = await prisma.node.findMany({
    where: { ownerId: userId, trashedAt: { not: null }, uploadComplete: true },
    include: { ...nodeInclude, parent: { select: { trashedAt: true } } },
    orderBy: { trashedAt: "desc" },
  });
  return rows.filter((r) => !r.parent?.trashedAt).map((r) => toDTO(r));
}

export async function search(userId: string, q: string): Promise<NodeDTO[]> {
  const term = q.trim();
  if (!term) return [];
  // Match names and, when AI indexing has run, summaries/tags.
  const matches: Prisma.NodeWhereInput = { OR: [{ name: { contains: term } }, { aiSummary: { contains: term } }, { aiTags: { contains: term } }] };
  const own = await prisma.node.findMany({
    where: { ownerId: userId, ...matches, ...live },
    include: nodeInclude,
    orderBy: order,
    take: 100,
  });

  // Shared items: anything shared directly with the user, plus everything inside shared folders.
  const shares = await prisma.share.findMany({ where: { userId }, select: { nodeId: true, role: true } });
  const roleFor = new Map<string, Role>();
  for (const s of shares) {
    roleFor.set(s.nodeId, s.role as Role);
    for (const id of await collectDescendantIds(s.nodeId)) roleFor.set(id, s.role as Role);
  }
  const shared = roleFor.size
    ? await prisma.node.findMany({
        where: { id: { in: [...roleFor.keys()] }, ...matches, ...live },
        include: nodeInclude,
        orderBy: order,
        take: 50,
      })
    : [];

  const ownOk = await withoutTrashedAncestors(own);
  const sharedOk = await withoutTrashedAncestors(shared);
  return [...ownOk.map((r) => toDTO(r)), ...sharedOk.map((n) => toDTO(n, roleFor.get(n.id) ?? "VIEWER"))];
}
