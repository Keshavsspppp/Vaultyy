import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { QUOTA_BYTES } from "@/lib/nodes";
import { aiEnabled } from "@/lib/ai";
import { DriveProvider } from "@/components/drive/DriveContext";
import { UploadProvider } from "@/components/drive/UploadProvider";
import { Sidebar } from "@/components/drive/Sidebar";
import { TopBar } from "@/components/drive/TopBar";

export default async function FilesLayout({ children }: LayoutProps<"/files">) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect("/login");

  return (
    <DriveProvider aiEnabled={aiEnabled}>
      <UploadProvider>
        <div className="flex h-full flex-col">
          <Suspense>
            <TopBar user={{ name: user.name, email: user.email, image: user.image }} />
          </Suspense>
          <div className="flex min-h-0 flex-1">
            <Sidebar storageUsed={user.storageUsed} quota={QUOTA_BYTES} />
            <main className="paper min-w-0 flex-1 overflow-hidden">{children}</main>
          </div>
        </div>
      </UploadProvider>
    </DriveProvider>
  );
}
