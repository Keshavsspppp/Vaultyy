import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { hardDelete } from "@/lib/nodes";

export const POST = route(async () => {
  const userId = await requireUserId();
  const trashed = await prisma.node.findMany({ where: { ownerId: userId, trashedAt: { not: null } } });
  for (const n of trashed) {
    // Skip nodes already removed as part of a deleted ancestor.
    const still = await prisma.node.findUnique({ where: { id: n.id } });
    if (still) await hardDelete(still);
  }
  return NextResponse.json({ ok: true });
});
