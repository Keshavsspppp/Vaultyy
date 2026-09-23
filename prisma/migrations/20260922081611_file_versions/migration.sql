-- CreateTable
CREATE TABLE "FileVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "mimeType" TEXT,
    "pending" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    CONSTRAINT "FileVersion_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FileVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Node" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER NOT NULL DEFAULT 0,
    "storageKey" TEXT,
    "uploadComplete" BOOLEAN NOT NULL DEFAULT true,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "trashedAt" DATETIME,
    "lastAccessedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ownerId" TEXT NOT NULL,
    "parentId" TEXT,
    CONSTRAINT "Node_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Node_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Node" ("createdAt", "id", "lastAccessedAt", "mimeType", "name", "ownerId", "parentId", "size", "starred", "storageKey", "trashedAt", "type", "updatedAt", "uploadComplete") SELECT "createdAt", "id", "lastAccessedAt", "mimeType", "name", "ownerId", "parentId", "size", "starred", "storageKey", "trashedAt", "type", "updatedAt", "uploadComplete" FROM "Node";
DROP TABLE "Node";
ALTER TABLE "new_Node" RENAME TO "Node";
CREATE UNIQUE INDEX "Node_storageKey_key" ON "Node"("storageKey");
CREATE INDEX "Node_ownerId_parentId_idx" ON "Node"("ownerId", "parentId");
CREATE INDEX "Node_ownerId_trashedAt_idx" ON "Node"("ownerId", "trashedAt");
CREATE INDEX "Node_name_idx" ON "Node"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "FileVersion_storageKey_key" ON "FileVersion"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "FileVersion_nodeId_version_key" ON "FileVersion"("nodeId", "version");

-- Backfill: every existing completed file becomes version 1 of itself.
INSERT INTO "FileVersion" ("id", "nodeId", "version", "storageKey", "size", "mimeType", "pending", "createdAt", "createdById")
SELECT
  lower(hex(randomblob(12))),
  "id",
  1,
  "storageKey",
  "size",
  "mimeType",
  0,
  "updatedAt",
  "ownerId"
FROM "Node"
WHERE "type" = 'FILE' AND "storageKey" IS NOT NULL AND "uploadComplete" = 1;
