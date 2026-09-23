import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";
import { HttpError, requireUserId } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { loadNode } from "@/lib/load-node";

type Ctx = { params: Promise<{ id: string }> };

async function shareState(nodeId: string) {
  const [shares, link] = await Promise.all([
    prisma.share.findMany({
      where: { nodeId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.shareLink.findUnique({ where: { nodeId } }),
  ]);
  return {
    users: shares.map((s) => ({ id: s.id, userId: s.userId, name: s.user.name, email: s.user.email, role: s.role })),
    link: link ? { token: link.token, role: link.role } : null,
  };
}

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  const { id } = await params;
  await loadNode(id, userId, "OWNER");
  return NextResponse.json(await shareState(id));
});

const addSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  role: z.enum(["VIEWER", "EDITOR"]),
});

/** Share with a user by email (creates or updates their role). */
export const POST = route(async (req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  await rateLimit("write", userId);
  const { id } = await params;
  const { email, role } = addSchema.parse(await req.json());
  await loadNode(id, userId, "OWNER");

  const target = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!target) throw new HttpError(404, "No account with that email");
  if (target.id === userId) throw new HttpError(400, "You already own this item");

  await prisma.share.upsert({
    where: { nodeId_userId: { nodeId: id, userId: target.id } },
    create: { nodeId: id, userId: target.id, role },
    update: { role },
  });
  return NextResponse.json(await shareState(id));
});

const linkSchema = z.object({
  enabled: z.boolean(),
  role: z.enum(["VIEWER", "EDITOR"]).default("VIEWER"),
});

/** Enable / disable / change the "anyone with the link" access. */
export const PUT = route(async (req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  const { id } = await params;
  const { enabled, role } = linkSchema.parse(await req.json());
  await loadNode(id, userId, "OWNER");

  if (!enabled) {
    await prisma.shareLink.deleteMany({ where: { nodeId: id } });
  } else {
    await prisma.shareLink.upsert({
      where: { nodeId: id },
      create: { nodeId: id, role, token: randomBytes(24).toString("base64url") },
      update: { role },
    });
  }
  return NextResponse.json(await shareState(id));
});

/** Remove a user share: `?shareId=`. */
export const DELETE = route(async (req: Request, { params }: Ctx) => {
  const userId = await requireUserId();
  const { id } = await params;
  const shareId = new URL(req.url).searchParams.get("shareId");
  if (!shareId) throw new HttpError(400, "shareId required");
  await loadNode(id, userId, "OWNER");
  await prisma.share.deleteMany({ where: { id: shareId, nodeId: id } });
  return NextResponse.json(await shareState(id));
});
