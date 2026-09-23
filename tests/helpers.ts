import { prisma } from "@/lib/prisma";

let n = 0;

/** Wipes every table so each test starts from nothing. */
export async function resetDb() {
  await prisma.fileVersion.deleteMany();
  await prisma.shareLink.deleteMany();
  await prisma.share.deleteMany();
  await prisma.node.deleteMany();
  await prisma.user.deleteMany();
}

export function user(name: string) {
  n++;
  return prisma.user.create({ data: { name, email: `${name.toLowerCase()}${n}@example.com`, passwordHash: "x" } });
}

export function folder(ownerId: string, name: string, parentId: string | null = null) {
  return prisma.node.create({ data: { name, type: "FOLDER", ownerId, parentId } });
}

/** Creates a completed file with its version-1 row, like upload/complete does. */
export function file(ownerId: string, name: string, parentId: string | null = null, size = 100) {
  n++;
  const storageKey = `${ownerId}/${n}`;
  return prisma.node.create({
    data: {
      name, type: "FILE", ownerId, parentId, size, mimeType: "text/plain", storageKey, uploadComplete: true,
      versions: { create: { version: 1, storageKey, size, mimeType: "text/plain", createdById: ownerId } },
    },
  });
}
