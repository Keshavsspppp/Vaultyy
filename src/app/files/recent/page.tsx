import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { listRecent } from "@/lib/queries";
import { FileBrowser } from "@/components/drive/FileBrowser";

export const metadata: Metadata = { title: "Recent" };

export default async function RecentPage() {
  const session = await auth();
  const items = await listRecent(session!.user.id);
  return <FileBrowser view="recent" title="Recent" items={items} />;
}
