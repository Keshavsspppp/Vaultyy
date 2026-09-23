import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { QUOTA_BYTES } from "@/lib/nodes";

export const GET = route(async () => {
  const userId = await requireUserId();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    storageUsed: user.storageUsed,
    quota: QUOTA_BYTES,
  });
});
