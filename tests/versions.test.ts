import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { deleteVersion, publishVersion, restoreVersion, VERSION_LIMIT } from "@/lib/versions";
import { hardDelete } from "@/lib/nodes";
import { file, resetDb, user } from "./helpers";

/** Mimics /versions (init): a pending row whose bytes are "already uploaded". */
async function pendingVersion(nodeId: string, ownerId: string, userId: string, size: number) {
  return prisma.fileVersion.create({
    data: { nodeId, version: -(1 + Math.floor(Math.random() * 2_000_000_000)), storageKey: `${ownerId}/v-${Math.random()}`, size, mimeType: "text/plain", pending: true, createdById: userId },
  });
}

describe("file versions", () => {
  beforeEach(resetDb);

  it("publishing a version numbers it, makes it current, and charges quota", async () => {
    const alice = await user("Alice");
    const f = await file(alice.id, "doc.txt", null, 100);
    await prisma.user.update({ where: { id: alice.id }, data: { storageUsed: 100 } });

    const pending = await pendingVersion(f.id, alice.id, alice.id, 250);
    const v2 = await publishVersion(f, pending, 250);

    expect(v2.version).toBe(2);
    expect(v2.pending).toBe(false);
    const node = await prisma.node.findUniqueOrThrow({ where: { id: f.id } });
    expect(node.currentVersion).toBe(2);
    expect(node.size).toBe(250);
    expect(node.storageKey).toBe(pending.storageKey);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: alice.id } })).storageUsed).toBe(350);
  });

  it("rejects a version that would exceed the quota and drops the pending row", async () => {
    const alice = await user("Alice");
    const f = await file(alice.id, "doc.txt", null, 100);
    await prisma.user.update({ where: { id: alice.id }, data: { storageUsed: 9_900 } });
    const pending = await pendingVersion(f.id, alice.id, alice.id, 500);

    await expect(publishVersion(f, pending, 500)).rejects.toMatchObject({ status: 413 });
    expect(await prisma.fileVersion.count({ where: { nodeId: f.id } })).toBe(1);
  });

  it("prunes the oldest non-current versions beyond the limit", async () => {
    expect(VERSION_LIMIT).toBe(3);
    const alice = await user("Alice");
    const f = await file(alice.id, "doc.txt", null, 10);
    await prisma.user.update({ where: { id: alice.id }, data: { storageUsed: 10 } });

    for (let i = 0; i < 4; i++) {
      const node = await prisma.node.findUniqueOrThrow({ where: { id: f.id } });
      await publishVersion(node, await pendingVersion(f.id, alice.id, alice.id, 10), 10);
    }
    const kept = await prisma.fileVersion.findMany({ where: { nodeId: f.id }, orderBy: { version: "asc" } });
    expect(kept.map((v) => v.version)).toEqual([3, 4, 5]);
    // 5 versions were charged, 2 were pruned -> 3 remain at 10 bytes each.
    expect((await prisma.user.findUniqueOrThrow({ where: { id: alice.id } })).storageUsed).toBe(30);
  });

  it("restore points the node at an older version without copying", async () => {
    const alice = await user("Alice");
    const f = await file(alice.id, "doc.txt", null, 100);
    const v1 = await prisma.fileVersion.findFirstOrThrow({ where: { nodeId: f.id } });
    await publishVersion(f, await pendingVersion(f.id, alice.id, alice.id, 200), 200);

    await restoreVersion(await prisma.node.findUniqueOrThrow({ where: { id: f.id } }), v1);
    const node = await prisma.node.findUniqueOrThrow({ where: { id: f.id } });
    expect(node.currentVersion).toBe(1);
    expect(node.size).toBe(100);
    expect(node.storageKey).toBe(v1.storageKey);
    expect(await prisma.fileVersion.count({ where: { nodeId: f.id } })).toBe(2);
  });

  it("deleting a version frees its quota; hard-deleting the file frees every version", async () => {
    const alice = await user("Alice");
    const f = await file(alice.id, "doc.txt", null, 100);
    await prisma.user.update({ where: { id: alice.id }, data: { storageUsed: 100 } });
    const v2 = await publishVersion(f, await pendingVersion(f.id, alice.id, alice.id, 300), 300);
    const v3 = await publishVersion(await prisma.node.findUniqueOrThrow({ where: { id: f.id } }), await pendingVersion(f.id, alice.id, alice.id, 50), 50);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: alice.id } })).storageUsed).toBe(450);

    await deleteVersion(v2);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: alice.id } })).storageUsed).toBe(150);
    expect(await prisma.fileVersion.count({ where: { nodeId: f.id } })).toBe(2);

    await hardDelete(await prisma.node.findUniqueOrThrow({ where: { id: f.id } }));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: alice.id } })).storageUsed).toBe(0);
    expect(await prisma.fileVersion.count()).toBe(0);
    void v3;
  });
});
