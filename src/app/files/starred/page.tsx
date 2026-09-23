import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { listStarred } from "@/lib/queries";
import { FileBrowser } from "@/components/drive/FileBrowser";

export const metadata: Metadata = { title: "Starred" };

export default async function StarredPage() {
  const session = await auth();
  const items = await listStarred(session!.user.id);
  return <FileBrowser view="starred" title="Starred" items={items} />;
}
