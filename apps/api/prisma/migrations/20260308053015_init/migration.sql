-- CreateTable
CREATE TABLE "PaletteGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "brand" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PaletteColor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hex" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PaletteColor_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PaletteGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PaletteGroup_code_key" ON "PaletteGroup"("code");

-- CreateIndex
CREATE INDEX "PaletteColor_groupId_idx" ON "PaletteColor"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "PaletteColor_groupId_code_key" ON "PaletteColor"("groupId", "code");
