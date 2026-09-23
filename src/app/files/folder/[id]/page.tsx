import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth, HttpError } from "@/lib/auth";
import { listFolder } from "@/lib/queries";
import { FileBrowser } from "@/components/drive/FileBrowser";

async function load(id: string) {
  const session = await auth();
  try {
    return await listFolder(session!.user.id, id);
  } catch (e) {
    if (e instanceof HttpError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: PageProps<"/files/folder/[id]">): Promise<Metadata> {
  const { id } = await params;
  const { folder } = await load(id);
  return { title: folder?.name ?? "Folder" };
}

export default async function FolderPage({ params }: PageProps<"/files/folder/[id]">) {
  const { id } = await params;
  const { items, role, breadcrumb, folder } = await load(id);
  const isOwn = role === "OWNER";
  return (
    <FileBrowser
      view="drive"
      title={isOwn ? "All files" : "Shared"}
      items={items}
      folderId={folder!.id}
      canWrite={role !== "VIEWER"}
      breadcrumb={breadcrumb}
      rootHref={isOwn ? "/files" : "/files/shared"}
    />
  );
}
