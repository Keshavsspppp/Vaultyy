import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { listFolder } from "@/lib/queries";
import { FileBrowser } from "@/components/drive/FileBrowser";

export const metadata: Metadata = { title: "All files" };

export default async function MyDrivePage() {
  const session = await auth();
  const { items } = await listFolder(session!.user.id, null);
  return <FileBrowser view="drive" title="All files" items={items} folderId={null} canWrite />;
}
