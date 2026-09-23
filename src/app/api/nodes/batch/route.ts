import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";
import { HttpError, requireUserId } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { loadNode } from "@/lib/load-node";
import { isSelfOrDescendant } from "@/lib/access";
import { hardDelete } from "@/lib/nodes";

const schema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  action: z.enum(["trash", "restore", "delete", "star", "unstar", "move"]),
  parentId: z.string().nullable().optional(), // for "move"
});

/**
 * Applies one action to many nodes. Each id is authorized independently; the
 * response lists which ones failed so the client can report partial success.
 */
export const POST = route(async (req: Request) => {
  const userId = await requireUserId();
  await rateLimit("write", userId);
  const { ids, action, parentId } = schema.parse(await req.json());

  if (action === "move" && parentId) {
    const { node: target } = await loadNode(parentId, userId, "OWNER");
    if (target.type !== "FOLDER") throw new HttpError(400, "Target is not a folder");
  }

  const failed: { id: string; error: string }[] = [];
  let ok = 0;

  for (const id of ids) {
    try {
      switch (action) {
        case "trash": {
          await loadNode(id, userId, "EDITOR");
          await prisma.node.update({ where: { id }, data: { trashedAt: new Date() } });
          break;
        }
        case "restore": {
          const node = await prisma.node.findUnique({ where: { id }, include: { parent: true } });
          if (!node || node.ownerId !== userId) throw new HttpError(404, "Not found");
          const parentOk = node.parent && !node.parent.trashedAt;
          await prisma.node.update({ where: { id }, data: { trashedAt: null, parentId: parentOk ? node.parentId : null } });
          break;
        }
        case "delete": {
          const { node } = await loadNode(id, userId, "OWNER");
          await hardDelete(node);
          break;
        }
        case "star":
        case "unstar": {
          await loadNode(id, userId, "VIEWER");
          await prisma.node.update({ where: { id }, data: { starred: action === "star" } });
          break;
        }
        case "move": {
          const { node } = await loadNode(id, userId, "OWNER");
          if (parentId && (await isSelfOrDescendant(node.id, parentId))) throw new HttpError(400, "Cannot move a folder into itself");
          await prisma.node.update({ where: { id }, data: { parentId: parentId ?? null } });
          break;
        }
      }
      ok++;
    } catch (e) {
      failed.push({ id, error: e instanceof HttpError ? e.message : "Failed" });
    }
  }

  return NextResponse.json({ ok, failed });
});
