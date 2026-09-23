import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";
import { HttpError, requireUserId } from "@/lib/auth";
import { loadNode } from "@/lib/load-node";
import { toDTO, nodeInclude } from "@/lib/nodes";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  parentId: z.string().nullable().optional(),
});

/** Create a folder. */
export const POST = route(async (req: Request) => {
  const userId = await requireUserId();
  const { name, parentId } = createSchema.parse(await req.json());

  let ownerId = userId;
  if (parentId) {
    const { node: parent } = await loadNode(parentId, userId, "EDITOR");
    if (parent.type !== "FOLDER") throw new HttpError(400, "Parent is not a folder");
    ownerId = parent.ownerId; // items created inside a shared folder belong to the folder owner
  }

  const folder = await prisma.node.create({
    data: { name, type: "FOLDER", parentId: parentId ?? null, ownerId },
    include: nodeInclude,
  });
  return NextResponse.json(toDTO(folder, ownerId === userId ? "OWNER" : "EDITOR"), { status: 201 });
});
