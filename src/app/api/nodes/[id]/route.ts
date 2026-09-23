import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";
import { HttpError, requireUserId } from "@/lib/auth";
import { loadNode } from "@/lib/load-node";
import { isSelfOrDescendant } from "@/lib/access";
import { hardDelete, nodeInclude, toDTO } from "@/lib/nodes";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  const { id } = await params;
  const { role } = await loadNode(id, userId, "VIEWER");
  const node = await prisma.node.findUniqueOrThrow({ where: { id }, include: nodeInclude });
  return NextResponse.json(toDTO(node, role));
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  starred: z.boolean().optional(),
  parentId: z.string().nullable().optional(), // move
});

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  const { id } = await params;
  const body = patchSchema.parse(await req.json());
  const { node, role } = await loadNode(id, userId, "VIEWER");

  const data: { name?: string; starred?: boolean; parentId?: string | null } = {};

  if (body.starred !== undefined) data.starred = body.starred;

  if (body.name !== undefined) {
    if (role === "VIEWER") throw new HttpError(403, "You only have view access");
    data.name = body.name;
  }

  if (body.parentId !== undefined && body.parentId !== node.parentId) {
    if (role !== "OWNER") throw new HttpError(403, "Only the owner can move this item");
    if (body.parentId) {
      const { node: target } = await loadNode(body.parentId, userId, "OWNER");
      if (target.type !== "FOLDER") throw new HttpError(400, "Target is not a folder");
      if (await isSelfOrDescendant(node.id, target.id)) throw new HttpError(400, "Cannot move a folder into itself");
    }
    data.parentId = body.parentId;
  }

  const updated = await prisma.node.update({ where: { id }, data, include: nodeInclude });
  return NextResponse.json(toDTO(updated, role));
});

/** Move to trash, or `?permanent=1` to delete forever (owner only). */
export const DELETE = route(async (req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  const { id } = await params;
  const permanent = new URL(req.url).searchParams.get("permanent") === "1";
  const { node, role } = await loadNode(id, userId, "VIEWER");

  if (permanent) {
    if (role !== "OWNER") throw new HttpError(403, "Only the owner can delete this item permanently");
    await hardDelete(node);
    return NextResponse.json({ ok: true });
  }

  if (role === "VIEWER") throw new HttpError(403, "You only have view access");
  await prisma.node.update({ where: { id }, data: { trashedAt: new Date() } });
  return NextResponse.json({ ok: true });
});
