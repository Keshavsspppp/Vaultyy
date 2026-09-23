import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";
import { HttpError, requireUserId } from "@/lib/auth";
import { loadNode } from "@/lib/load-node";

const schema = z.object({
  parentId: z.string().nullable().optional(),
  segments: z.array(z.string().trim().min(1).max(255)).min(1).max(64),
});

/**
 * Ensures a nested folder path exists under `parentId` (creating any missing
 * segments) and returns the id of the deepest folder. Used by folder uploads.
 */
export const POST = route(async (req: Request) => {
  const userId = await requireUserId();
  const { parentId, segments } = schema.parse(await req.json());

  let ownerId = userId;
  let cur: string | null = parentId ?? null;
  if (cur) {
    const { node: parent } = await loadNode(cur, userId, "EDITOR");
    if (parent.type !== "FOLDER") throw new HttpError(400, "Parent is not a folder");
    ownerId = parent.ownerId;
  }

  for (const name of segments) {
    const existing = await prisma.node.findFirst({
      where: { parentId: cur, ownerId, name, type: "FOLDER", trashedAt: null },
      select: { id: true },
    });
    cur = existing ? existing.id : (await prisma.node.create({ data: { name, type: "FOLDER", parentId: cur, ownerId }, select: { id: true } })).id;
  }

  return NextResponse.json({ id: cur });
});
