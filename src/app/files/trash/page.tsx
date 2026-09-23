import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { listTrash } from "@/lib/queries";
import { FileBrowser } from "@/components/drive/FileBrowser";

export const metadata: Metadata = { title: "Trash" };

export default async function TrashPage() {
  const session = await auth();
  const items = await listTrash(session!.user.id);
  return <FileBrowser view="trash" title="Trash" items={items} />;
}
