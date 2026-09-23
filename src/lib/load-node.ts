import { prisma } from "@/lib/prisma";
import { getAccess, roleAtLeast, type Role } from "@/lib/access";
import { HttpError } from "@/lib/errors";

/** Loads a node and asserts the caller has at least `min` access to it. */
export async function loadNode(id: string, userId: string | null, min: Role, linkToken?: string | null) {
  const node = await prisma.node.findUnique({ where: { id } });
  if (!node) throw new HttpError(404, "Not found");
  const { role, ancestry } = await getAccess(node, userId, linkToken);
  if (!roleAtLeast(role, min)) throw new HttpError(role ? 403 : 404, role ? "Forbidden" : "Not found");
  return { node, role, ancestry };
}
