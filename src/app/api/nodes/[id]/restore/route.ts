import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";
import { HttpError, requireUserId } from "@/lib/auth";

export const POST = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUserId();
  const { id } = await params;
  const node = await prisma.node.findUnique({ where: { id }, include: { parent: true } });
  if (!node || node.ownerId !== userId) throw new HttpError(404, "Not found");

  // If the original parent is gone or itself trashed, restore to the root.
  const parentOk = node.parent && !node.parent.trashedAt;
  await prisma.node.update({
    where: { id },
    data: { trashedAt: null, parentId: parentOk ? node.parentId : null },
  });
  return NextResponse.json({ ok: true });
});
