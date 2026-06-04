---
phase: 1
title: "D1 Migration"
status: pending
effort: "30m"
dependencies: []
---

# Phase 1: D1 Migration

## Overview

Tạo bảng `custom_domains` trong D1 để lưu các domain được thêm qua UI. Migration file theo pattern hiện có (`migrations/0001-auth-schema.sql`).

## Architecture

```sql
custom_domains
├── id          TEXT PRIMARY KEY       -- UUID
├── domain      TEXT NOT NULL UNIQUE   -- e.g. "newdomain.com"
├── created_at  TEXT NOT NULL          -- ISO timestamp
└── created_by  TEXT NOT NULL          -- userId of admin who added it
```

Domain phải unique — tránh duplicate giữa D1 entries, dù env var có thể overlap (backend dedup khi merge).

## Related Code Files

- Create: `migrations/0002-custom-domains.sql`

## Implementation Steps

1. Tạo file `migrations/0002-custom-domains.sql`:

```sql
CREATE TABLE IF NOT EXISTS "custom_domains" (
    "id" TEXT PRIMARY KEY,
    "domain" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    UNIQUE ("domain")
);

CREATE INDEX IF NOT EXISTS "custom_domains_domain" ON "custom_domains"("domain");
```

2. Apply migration locally (dev):
```bash
wrangler d1 migrations apply auth-db --local
```

3. Apply migration production:
```bash
wrangler d1 migrations apply auth-db-production --env production --remote
```

> **Note:** Migration naming follows D1's lexicographic order — `0002-` runs after `0001-auth-schema.sql` automatically.

## Success Criteria

- [ ] `migrations/0002-custom-domains.sql` exists với schema đúng
- [ ] Migration apply thành công (local + production)
- [ ] Bảng `custom_domains` có UNIQUE constraint trên `domain`

## Risk Assessment

- **Low risk** — additive migration, không ảnh hưởng schema hiện tại
- D1 migrations are idempotent (`CREATE TABLE IF NOT EXISTS`)
