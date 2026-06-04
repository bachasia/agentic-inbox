CREATE TABLE IF NOT EXISTS "custom_domains" (
    "id" TEXT PRIMARY KEY,
    "domain" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    UNIQUE ("domain")
);

CREATE INDEX IF NOT EXISTS "custom_domains_domain" ON "custom_domains"("domain");
