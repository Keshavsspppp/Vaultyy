import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAccess, getVisibleBreadcrumb, isSelfOrDescendant, roleAtLeast } from "@/lib/access";
import { loadNode } from "@/lib/load-node";
import { HttpError } from "@/lib/errors";
import { file, folder, resetDb, user } from "./helpers";

describe("getAccess", () => {
  beforeEach(resetDb);

  it("owner always has OWNER role, strangers have none", async () => {
    const alice = await user("Alice");
    const bob = await user("Bob");
    const f = await file(alice.id, "a.txt");
    expect((await getAccess(f, alice.id)).role).toBe("OWNER");
    expect((await getAccess(f, bob.id)).role).toBeNull();
    expect((await getAccess(f, null)).role).toBeNull();
  });

  it("share on an ancestor folder is inherited by descendants", async () => {
    const alice = await user("Alice");
    const bob = await user("Bob");
    const root = await folder(alice.id, "root");
    const sub = await folder(alice.id, "sub", root.id);
    const deep = await file(alice.id, "deep.txt", sub.id);
    await prisma.share.create({ data: { nodeId: root.id, userId: bob.id, role: "VIEWER" } });

    expect((await getAccess(deep, bob.id)).role).toBe("VIEWER");
    expect((await getAccess(sub, bob.id)).role).toBe("VIEWER");
  });

  it("takes the strongest role when several shares apply", async () => {
    const alice = await user("Alice");
    const bob = await user("Bob");
    const root = await folder(alice.id, "root");
    const sub = await folder(alice.id, "sub", root.id);
    await prisma.share.create({ data: { nodeId: root.id, userId: bob.id, role: "VIEWER" } });
    await prisma.share.create({ data: { nodeId: sub.id, userId: bob.id, role: "EDITOR" } });
    expect((await getAccess(sub, bob.id)).role).toBe("EDITOR");
  });

  it("share links grant access to anonymous visitors, only under the linked node", async () => {
    const alice = await user("Alice");
    const root = await folder(alice.id, "root");
    const inside = await file(alice.id, "in.txt", root.id);
    const outside = await file(alice.id, "out.txt");
    await prisma.shareLink.create({ data: { nodeId: root.id, token: "tok", role: "VIEWER" } });

    expect((await getAccess(inside, null, "tok")).role).toBe("VIEWER");
    expect((await getAccess(outside, null, "tok")).role).toBeNull();
    expect((await getAccess(inside, null, "wrong")).role).toBeNull();
  });

  it("trashed ancestors hide items from everyone but the owner", async () => {
    const alice = await user("Alice");
    const bob = await user("Bob");
    const root = await folder(alice.id, "root");
    const inside = await file(alice.id, "in.txt", root.id);
    await prisma.share.create({ data: { nodeId: root.id, userId: bob.id, role: "EDITOR" } });
    await prisma.node.update({ where: { id: root.id }, data: { trashedAt: new Date() } });

    expect((await getAccess(inside, bob.id)).role).toBeNull();
    expect((await getAccess(inside, alice.id)).role).toBe("OWNER");
  });

  it("roleAtLeast orders VIEWER < EDITOR < OWNER", () => {
    expect(roleAtLeast("OWNER", "EDITOR")).toBe(true);
    expect(roleAtLeast("EDITOR", "OWNER")).toBe(false);
    expect(roleAtLeast("VIEWER", "VIEWER")).toBe(true);
    expect(roleAtLeast(null, "VIEWER")).toBe(false);
  });
});

describe("getVisibleBreadcrumb", () => {
  beforeEach(resetDb);

  it("stops at the shared root so the owner tree is not revealed", async () => {
    const alice = await user("Alice");
    const bob = await user("Bob");
    const top = await folder(alice.id, "top");
    const shared = await folder(alice.id, "shared", top.id);
    const sub = await folder(alice.id, "sub", shared.id);
    await prisma.share.create({ data: { nodeId: shared.id, userId: bob.id, role: "VIEWER" } });

    const { ancestry } = await getAccess(sub, bob.id);
    const trail = await getVisibleBreadcrumb(ancestry, bob.id);
    expect(trail.map((t) => t.name)).toEqual(["shared", "sub"]);

    const own = await getVisibleBreadcrumb(ancestry, alice.id);
    expect(own.map((t) => t.name)).toEqual(["top", "shared", "sub"]);
  });
});

describe("loadNode / isSelfOrDescendant", () => {
  beforeEach(resetDb);

  it("returns 404 for unknown or inaccessible nodes and 403 for insufficient role", async () => {
    const alice = await user("Alice");
    const bob = await user("Bob");
    const f = await file(alice.id, "a.txt");
    await expect(loadNode("nope", alice.id, "VIEWER")).rejects.toMatchObject({ status: 404 });
    await expect(loadNode(f.id, bob.id, "VIEWER")).rejects.toMatchObject({ status: 404 });

    await prisma.share.create({ data: { nodeId: f.id, userId: bob.id, role: "VIEWER" } });
    await expect(loadNode(f.id, bob.id, "EDITOR")).rejects.toBeInstanceOf(HttpError);
    await expect(loadNode(f.id, bob.id, "EDITOR")).rejects.toMatchObject({ status: 403 });
    await expect(loadNode(f.id, bob.id, "VIEWER")).resolves.toMatchObject({ role: "VIEWER" });
  });

  it("detects moving a folder into itself or its descendants", async () => {
    const alice = await user("Alice");
    const a = await folder(alice.id, "a");
    const b = await folder(alice.id, "b", a.id);
    const c = await folder(alice.id, "c");
    expect(await isSelfOrDescendant(a.id, a.id)).toBe(true);
    expect(await isSelfOrDescendant(a.id, b.id)).toBe(true);
    expect(await isSelfOrDescendant(a.id, c.id)).toBe(false);
    expect(await isSelfOrDescendant(a.id, null)).toBe(false);
  });
});
