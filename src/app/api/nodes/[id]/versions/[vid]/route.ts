import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";
import { HttpError, requireUserId } from "@/lib/auth";
import { loadNode } from "@/lib/load-node";
import { deleteVersion } from "@/lib/versions";

/** Permanently deletes one non-current version (owner only). */
export const DELETE = route(async (_req: Request, { params }: { params: Promise<{ id: string; vid: string }> }) => {
  const userId = await requireUserId();
  const { id, vid } = await params;
  const { node } = await loadNode(id, userId, "OWNER");
  const v = await prisma.fileVersion.findUnique({ where: { id: vid } });
  if (!v || v.nodeId !== id || v.pending) throw new HttpError(404, "Unknown version");
  if (v.version === node.currentVersion) throw new HttpError(400, "The current version cannot be deleted");
  await deleteVersion(v);
  return NextResponse.json({ ok: true });
});
