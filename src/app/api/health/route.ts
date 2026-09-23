import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe for the host: confirms the process and database respond. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", uptime: Math.round(process.uptime()) });
  } catch {
    return NextResponse.json({ status: "error", detail: "database unreachable" }, { status: 503 });
  }
}
