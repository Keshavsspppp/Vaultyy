import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { auth, HttpError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listFolder } from "@/lib/queries";
import { loadNode } from "@/lib/load-node";
import { toDTO, nodeInclude } from "@/lib/nodes";
import { formatBytes } from "@/lib/format";
import { Wordmark } from "@/components/Logo";
import { DriveProvider } from "@/components/drive/DriveContext";
import { UploadProvider } from "@/components/drive/UploadProvider";
import { FileBrowser } from "@/components/drive/FileBrowser";
import { FileIcon } from "@/components/drive/FileIcon";
import { PublicFilePreview } from "@/components/drive/PublicFilePreview";

async function resolve(token: string, folderParam: string | undefined) {
  const link = await prisma.shareLink.findUnique({ where: { token }, include: { node: { include: nodeInclude } } });
  if (!link) notFound();
  const session = await auth();
  const userId = session?.user?.id ?? null;

  try {
    // Verify the link root is still accessible (not trashed etc.).
    await loadNode(link.nodeId, userId, "VIEWER", token);
    const root = link.node;
    if (root.type === "FILE") return { kind: "file" as const, root, userId, link };
    const folderId = folderParam ?? root.id;
    const { items, breadcrumb, folder } = await listFolder(userId, folderId, token);
    return { kind: "folder" as const, root, userId, link, items, breadcrumb, folder };
  } catch (e) {
    if (e instanceof HttpError) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: PageProps<"/s/[token]">): Promise<Metadata> {
  const { token } = await params;
  const link = await prisma.shareLink.findUnique({ where: { token }, include: { node: { select: { name: true } } } });
  return { title: link ? link.node.name : "Shared item" };
}

export default async function SharedLinkPage({ params, searchParams }: PageProps<"/s/[token]">) {
  const { token } = await params;
  const { folder: folderParam } = await searchParams;
  const data = await resolve(token, typeof folderParam === "string" ? folderParam : undefined);

  return (
    <DriveProvider>
      <UploadProvider>
        <div className="flex h-full flex-col">
          <header className="flex h-16 items-center gap-4 border-b border-border px-6">
            <Link href="/files">
              <Wordmark />
            </Link>
            <span className="ml-auto text-sm text-muted">
              Shared by {data.root.owner.name}
              {!data.userId && (
                <>
                  {" · "}
                  <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
                    Sign in
                  </Link>
                </>
              )}
            </span>
          </header>
          <main className="paper min-h-0 flex-1 overflow-hidden">
            {data.kind === "folder" ? (
              <FileBrowser
                view="public"
                title={data.root.name}
                items={data.items}
                folderId={data.folder!.id}
                // Breadcrumb is relative to the shared root; the root itself is the title.
                breadcrumb={data.breadcrumb.filter((c) => c.id !== data.root.id)}
                linkToken={token}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
                <FileIcon type="FILE" mimeType={data.root.mimeType} name={data.root.name} size={72} />
                <div>
                  <h1 className="font-display text-3xl">{data.root.name}</h1>
                  <p className="mt-1 text-sm text-muted">{formatBytes(data.root.size)}</p>
                </div>
                <div className="flex gap-3">
                  <PublicFilePreview node={toDTO(data.root, "VIEWER")} token={token} />
                  <a
                    href={`/api/nodes/${data.root.id}/download?token=${token}`}
                    className="flex items-center gap-2 rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-primary"
                  >
                    <Download size={16} /> Download
                  </a>
                </div>
              </div>
            )}
          </main>
        </div>
      </UploadProvider>
    </DriveProvider>
  );
}
