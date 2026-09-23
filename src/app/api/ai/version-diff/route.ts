import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";
import { HttpError, requireUserId } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { loadNode } from "@/lib/load-node";
import { diffVersions } from "@/lib/ai";

const schema = z.object({ nodeId: z.string(), fromId: z.string(), toId: z.string() });

/** Explains what changed between two versions of a file. */
export const POST = route(async (req: Request) => {
  const userId = await requireUserId();
  await rateLimit("ai", userId);
  const { nodeId, fromId, toId } = schema.parse(await req.json());
  const { node } = await loadNode(nodeId, userId, "VIEWER");
  const [from, to] = await Promise.all([
    prisma.fileVersion.findUnique({ where: { id: fromId } }),
    prisma.fileVersion.findUnique({ where: { id: toId } }),
  ]);
  if (!from || !to || from.nodeId !== nodeId || to.nodeId !== nodeId || from.pending || to.pending) throw new HttpError(404, "Unknown version");
  return NextResponse.json({ summary: await diffVersions(node, from, to) });
});
