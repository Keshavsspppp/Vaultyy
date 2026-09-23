import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { search } from "@/lib/queries";
import { FileBrowser } from "@/components/drive/FileBrowser";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: PageProps<"/files/search">) {
  const { q } = await searchParams;
  const term = typeof q === "string" ? q : "";
  const session = await auth();
  const items = await search(session!.user.id, term);
  return (
    <FileBrowser
      view="search"
      title={term ? `Results for "${term}"` : "Search"}
      items={items}
      emptyText={term ? `No files or folders match "${term}"` : "Type in the search box to find files"}
    />
  );
}
