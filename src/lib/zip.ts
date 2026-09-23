import { ZipArchive } from "archiver";
import { Readable } from "node:stream";
import type { Node } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";

type Entry = { path: string; node: Node };

/** Flattens a set of root nodes into zip entries, preserving folder structure. */
async function collectEntries(roots: Node[]): Promise<Entry[]> {
  const out: Entry[] = [];
  const seen = new Set<string>();

  async function walk(node: Node, prefix: string) {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    const path = prefix + node.name;
    if (node.type === "FILE") {
      if (node.storageKey && node.uploadComplete) out.push({ path, node });
      return;
    }
    const children = await prisma.node.findMany({
      where: { parentId: node.id, trashedAt: null, uploadComplete: true },
      orderBy: [{ type: "desc" }, { name: "asc" }],
    });
    if (children.length === 0) out.push({ path: path + "/", node }); // keep empty folders
    for (const c of children) await walk(c, path + "/");
  }

  for (const r of roots) await walk(r, "");
  return out;
}

/** Streams a zip of the given nodes as a web Response. */
export async function zipResponse(roots: Node[], filename: string): Promise<Response> {
  const entries = await collectEntries(roots);
  const storage = getStorage();
  const archive = new ZipArchive({ zlib: { level: 6 } });

  // Errors surface on the archive stream; log and end the stream so the client sees a truncated file rather than a hang.
  archive.on("warning", (err) => console.warn("zip warning", err));
  archive.on("error", (err) => {
    console.error("zip error", err);
    archive.abort();
  });

  (async () => {
    for (const e of entries) {
      if (e.path.endsWith("/")) {
        archive.append("", { name: e.path });
        continue;
      }
      const stream = await storage.getStream(e.node.storageKey!);
      archive.append(stream, { name: e.path, date: e.node.updatedAt });
    }
    await archive.finalize();
  })().catch((err) => {
    console.error("zip build failed", err);
    archive.abort();
  });

  return new Response(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
