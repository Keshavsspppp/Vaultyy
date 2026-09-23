import { NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";
import { HttpError, requireUserId } from "@/lib/auth";
import { loadNode } from "@/lib/load-node";
import { getStorage } from "@/lib/storage";
import { nodeInclude, toDTO, QUOTA_BYTES } from "@/lib/nodes";
import { firstVersionData } from "@/lib/versions";
import { aiEnabled, summarize } from "@/lib/ai";

const schema = z.object({ nodeId: z.string() });

/** Step 2 of an upload: verify the bytes landed, then publish the node and charge quota. */
export const POST = route(async (req: Request) => {
  const userId = await requireUserId();
  const { nodeId } = schema.parse(await req.json());
  const { node, role } = await loadNode(nodeId, userId, "EDITOR");
  if (node.type !== "FILE" || !node.storageKey) throw new HttpError(400, "Not a file upload");
  if (node.uploadComplete) {
    const n = await prisma.node.findUniqueOrThrow({ where: { id: nodeId }, include: nodeInclude });
    return NextResponse.json(toDTO(n, role));
  }

  const actual = await getStorage().getSize(node.storageKey);
  if (actual === null) {
    await prisma.node.delete({ where: { id: nodeId } });
    throw new HttpError(400, "Upload did not complete");
  }

  const owner = await prisma.user.findUniqueOrThrow({ where: { id: node.ownerId } });
  if (owner.storageUsed + actual > QUOTA_BYTES) {
    await getStorage().delete(node.storageKey).catch(() => {});
    await prisma.node.delete({ where: { id: nodeId } });
    throw new HttpError(413, "Not enough storage space");
  }

  const [updated] = await prisma.$transaction([
    prisma.node.update({
      where: { id: nodeId },
      data: { uploadComplete: true, size: actual, lastAccessedAt: new Date() },
      include: nodeInclude,
    }),
    prisma.user.update({ where: { id: node.ownerId }, data: { storageUsed: { increment: actual } } }),
    prisma.fileVersion.create({ data: firstVersionData(node, actual, userId) }),
  ]);
  // Index the file with AI after the response is sent; failures are recorded on the node, never surfaced here.
  if (aiEnabled) after(() => summarize(nodeId).catch(() => {}));
  return NextResponse.json(toDTO(updated, role));
});
