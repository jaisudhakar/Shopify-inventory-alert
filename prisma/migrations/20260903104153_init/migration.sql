-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" DATETIME,
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false
);

-- CreateTable
CREATE TABLE "AlertSetting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "threshold" INTEGER NOT NULL DEFAULT 10,
    "recipients" TEXT NOT NULL DEFAULT '',
    "sendHour" INTEGER NOT NULL DEFAULT 8,
    "sendMinute" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "includeUntracked" BOOLEAN NOT NULL DEFAULT false,
    "onlyActiveProducts" BOOLEAN NOT NULL DEFAULT true,
    "skipWhenEmpty" BOOLEAN NOT NULL DEFAULT true,
    "lastSentLocalDate" TEXT,
    "lastRunAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AlertRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "recipients" TEXT NOT NULL DEFAULT '',
    "message" TEXT,
    "payload" TEXT,
    "runAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Session_shop_idx" ON "Session"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "AlertSetting_shop_key" ON "AlertSetting"("shop");

-- CreateIndex
CREATE INDEX "AlertRun_shop_runAt_idx" ON "AlertRun"("shop", "runAt");
