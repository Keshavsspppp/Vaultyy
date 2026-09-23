import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";
import { HttpError, requireUserId } from "@/lib/auth";
import { loadNode } from "@/lib/load-node";
import { restoreVersion } from "@/lib/versions";

/** Makes an earlier version the current one (editors and owners). */
export const POST = route(async (_req: Request, { params }: { params: Promise<{ id: string; vid: string }> }) => {
  const userId = await requireUserId();
  const { id, vid } = await params;
  const { node } = await loadNode(id, userId, "EDITOR");
  const v = await prisma.fileVersion.findUnique({ where: { id: vid } });
  if (!v || v.nodeId !== id || v.pending) throw new HttpError(404, "Unknown version");
  await restoreVersion(node, v);
  return NextResponse.json({ ok: true, currentVersion: v.version });
});
