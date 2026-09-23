import { NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";
import { HttpError, requireUserId } from "@/lib/auth";
import { loadNode } from "@/lib/load-node";
import { getStorage } from "@/lib/storage";
import { publishVersion, toVersionDTO } from "@/lib/versions";
import { aiEnabled, summarize } from "@/lib/ai";

const schema = z.object({ versionId: z.string() });

/** Step 2 of uploading a new version: verify the bytes and make it the current version. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUserId();
  const { id } = await params;
  const { versionId } = schema.parse(await req.json());
  const { node } = await loadNode(id, userId, "EDITOR");

  const pending = await prisma.fileVersion.findUnique({ where: { id: versionId } });
  if (!pending || pending.nodeId !== id) throw new HttpError(404, "Unknown version");
  if (!pending.pending) return NextResponse.json(toVersionDTO(pending, node.currentVersion));

  const actual = await getStorage().getSize(pending.storageKey);
  if (actual === null) {
    await prisma.fileVersion.delete({ where: { id: versionId } });
    throw new HttpError(400, "Upload did not complete");
  }

  const published = await publishVersion(node, pending, actual);
  if (aiEnabled) after(() => summarize(id).catch(() => {}));
  return NextResponse.json(toVersionDTO(published, published.version));
});
