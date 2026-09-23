import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { collectDescendantIds, hardDelete } from "@/lib/nodes";
import { listFolder, listShared, listStarred, listTrash, search } from "@/lib/queries";
import { getLocalStorage } from "@/lib/storage";
import { file, folder, resetDb, user } from "./helpers";

const uploadDir = path.resolve(process.env.LOCAL_UPLOAD_DIR!);

/** Writes a fake object to local storage so hardDelete has something to remove. */
async function putBytes(key: string, bytes: string) {
  const stream = new Blob([bytes]).stream();
  await getLocalStorage().write(key, stream);
}

describe("hardDelete", () => {
  beforeEach(resetDb);

  it("removes the whole subtree, its stored objects, and releases quota", async () => {
    const alice = await user("Alice");
    const root = await folder(alice.id, "root");
    const sub = await folder(alice.id, "sub", root.id);
    const f1 = await file(alice.id, "a.txt", root.id, 300);
    const f2 = await file(alice.id, "b.txt", sub.id, 200);
    await prisma.user.update({ where: { id: alice.id }, data: { storageUsed: 500 } });
    await putBytes(f1.storageKey!, "aaa");
    await putBytes(f2.storageKey!, "bb");
    expect(fs.existsSync(path.join(uploadDir, f1.storageKey!))).toBe(true);

    expect(await collectDescendantIds(root.id)).toHaveLength(3);
    await hardDelete(root);

    expect(await prisma.node.count()).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: alice.id } })).storageUsed).toBe(0);
    expect(fs.existsSync(path.join(uploadDir, f1.storageKey!))).toBe(false);
    expect(fs.existsSync(path.join(uploadDir, f2.storageKey!))).toBe(false);
  });

  it("does not release quota for uploads that never completed", async () => {
    const alice = await user("Alice");
    const pending = await prisma.node.create({
      data: { name: "p", type: "FILE", ownerId: alice.id, size: 999, storageKey: `${alice.id}/pending`, uploadComplete: false },
    });
    await prisma.user.update({ where: { id: alice.id }, data: { storageUsed: 50 } });
    await hardDelete(pending);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: alice.id } })).storageUsed).toBe(50);
  });
});

describe("listing queries", () => {
  beforeEach(resetDb);

  it("listFolder returns live children, folders first, with inherited role", async () => {
    const alice = await user("Alice");
    const bob = await user("Bob");
    const root = await folder(alice.id, "root");
    await file(alice.id, "z.txt", root.id);
    await folder(alice.id, "a-folder", root.id);
    const trashed = await file(alice.id, "gone.txt", root.id);
    await prisma.node.update({ where: { id: trashed.id }, data: { trashedAt: new Date() } });
    await prisma.node.create({ data: { name: "pending", type: "FILE", ownerId: alice.id, parentId: root.id, uploadComplete: false } });
    await prisma.share.create({ data: { nodeId: root.id, userId: bob.id, role: "EDITOR" } });

    const own = await listFolder(alice.id, root.id);
    expect(own.items.map((i) => i.name)).toEqual(["a-folder", "z.txt"]);
    expect(own.role).toBe("OWNER");

    const theirs = await listFolder(bob.id, root.id);
    expect(theirs.items.every((i) => i.role === "EDITOR")).toBe(true);
    expect(theirs.breadcrumb.map((b) => b.name)).toEqual(["root"]);
  });

  it("listShared excludes items inside trashed folders", async () => {
    const alice = await user("Alice");
    const bob = await user("Bob");
    const root = await folder(alice.id, "root");
    const inner = await file(alice.id, "inner.txt", root.id);
    const solo = await file(alice.id, "solo.txt");
    await prisma.share.create({ data: { nodeId: inner.id, userId: bob.id, role: "VIEWER" } });
    await prisma.share.create({ data: { nodeId: solo.id, userId: bob.id, role: "VIEWER" } });
    await prisma.node.update({ where: { id: root.id }, data: { trashedAt: new Date() } });

    expect((await listShared(bob.id)).map((i) => i.name)).toEqual(["solo.txt"]);
  });

  it("listTrash shows only top-level trashed items; listStarred hides trashed ones", async () => {
    const alice = await user("Alice");
    const root = await folder(alice.id, "root");
    const child = await file(alice.id, "child.txt", root.id);
    const other = await file(alice.id, "other.txt");
    await prisma.node.update({ where: { id: root.id }, data: { trashedAt: new Date(), starred: true } });
    await prisma.node.update({ where: { id: child.id }, data: { starred: true } });
    await prisma.node.update({ where: { id: other.id }, data: { starred: true } });

    expect((await listTrash(alice.id)).map((i) => i.name)).toEqual(["root"]);
    expect((await listStarred(alice.id)).map((i) => i.name)).toEqual(["other.txt"]);
  });

  it("search covers own files and the contents of shared folders", async () => {
    const alice = await user("Alice");
    const bob = await user("Bob");
    const shared = await folder(alice.id, "shared");
    await file(alice.id, "report.pdf", shared.id);
    await file(alice.id, "report-private.pdf");
    await file(bob.id, "my-report.txt");
    await prisma.share.create({ data: { nodeId: shared.id, userId: bob.id, role: "VIEWER" } });

    const names = (await search(bob.id, "report")).map((i) => `${i.name}:${i.role}`).sort();
    expect(names).toEqual(["my-report.txt:OWNER", "report.pdf:VIEWER"]);
    expect(await search(bob.id, "   ")).toEqual([]);
  });
});
