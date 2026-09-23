import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { loadNode } from "@/lib/load-node";

/** Lists sub-folders the user owns under `?parent=` (root when omitted). Used by the move picker. */
export const GET = route(async (req: Request) => {
  const userId = await requireUserId();
  const parent = new URL(req.url).searchParams.get("parent");
  if (parent) await loadNode(parent, userId, "OWNER");
  const folders = await prisma.node.findMany({
    where: { ownerId: userId, type: "FOLDER", trashedAt: null, parentId: parent || null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return NextResponse.json(folders);
});
