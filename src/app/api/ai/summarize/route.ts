import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/api";
import { requireUserId } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { loadNode } from "@/lib/load-node";
import { summarize } from "@/lib/ai";

const schema = z.object({ nodeId: z.string() });

/** Generates (or regenerates) the AI summary + tags for a file. */
export const POST = route(async (req: Request) => {
  const userId = await requireUserId();
  await rateLimit("ai", userId);
  const { nodeId } = schema.parse(await req.json());
  await loadNode(nodeId, userId, "VIEWER");
  return NextResponse.json(await summarize(nodeId));
});
