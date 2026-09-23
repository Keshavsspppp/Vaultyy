import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { listShared } from "@/lib/queries";
import { FileBrowser } from "@/components/drive/FileBrowser";

export const metadata: Metadata = { title: "Shared" };

export default async function SharedPage() {
  const session = await auth();
  const items = await listShared(session!.user.id);
  return <FileBrowser view="shared" title="Shared" items={items} />;
}
