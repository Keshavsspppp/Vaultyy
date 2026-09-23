import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const POST = route(async (req: Request) => {
  await rateLimit("auth");
  const { name, email, password } = schema.parse(await req.json());
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    throw new HttpError(
      409,
      existing.passwordHash
        ? "An account with that email already exists"
        : "That email is registered through Google. Use the Google button to sign in.",
    );
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { name, email: email.toLowerCase(), passwordHash } });
  return NextResponse.json({ id: user.id }, { status: 201 });
});
