import type { Node } from "@/generated/prisma/client";
import { route } from "@/lib/api";
import { auth, HttpError } from "@/lib/auth";
import { loadNode } from "@/lib/load-node";
import { zipResponse } from "@/lib/zip";

/** Downloads several items as one zip: `?ids=a,b,c[&token=]`. */
export const GET = route(async (req: Request) => {
  const url = new URL(req.url);
  const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean);
  const token = url.searchParams.get("token");
  if (ids.length === 0 || ids.length > 200) throw new HttpError(400, "Provide 1-200 ids");

  const session = await auth();
  const userId = session?.user?.id ?? null;

  const nodes: Node[] = [];
  for (const id of ids) nodes.push((await loadNode(id, userId, "VIEWER", token)).node);

  const name = nodes.length === 1 ? `${nodes[0].name}.zip` : `drive-download-${new Date().toISOString().slice(0, 10)}.zip`;
  return zipResponse(nodes, name);
});
