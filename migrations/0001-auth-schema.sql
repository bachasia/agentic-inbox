-- Better Auth core tables
CREATE TABLE IF NOT EXISTS "user" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL UNIQUE,
    "emailVerified" INTEGER NOT NULL DEFAULT 0,
    "image" TEXT,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    "role" TEXT DEFAULT 'member',
    "banned" INTEGER DEFAULT 0,
    "banReason" TEXT,
    "banExpires" TEXT
);

CREATE TABLE IF NOT EXISTS "session" (
    "id" TEXT PRIMARY KEY,
    "expiresAt" TEXT NOT NULL,
    "token" TEXT NOT NULL UNIQUE,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "impersonatedBy" TEXT,
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
    "id" TEXT PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TEXT,
    "refreshTokenExpiresAt" TEXT,
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "verification" (
    "id" TEXT PRIMARY KEY,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TEXT NOT NULL,
    "createdAt" TEXT,
    "updatedAt" TEXT
);

-- Custom table: per-user mailbox access permissions
CREATE TABLE IF NOT EXISTS "mailbox_permission" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    UNIQUE ("userId", "mailboxId"),
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "mailbox_permission_userId" ON "mailbox_permission"("userId");
CREATE INDEX IF NOT EXISTS "mailbox_permission_mailboxId" ON "mailbox_permission"("mailboxId");
