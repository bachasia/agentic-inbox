---
phase: 1
title: "DB Migrations & Schema"
status: complete
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: DB Migrations & Schema

## Overview

Add all new DO SQLite tables and columns needed by Phase 2 features in a single coordinated migration batch. Establishes the data foundation before any feature code is written.

## Requirements

- Functional:
  - `labels` table: id (slug), name, color (hex string)
  - `email_labels` join table: email_id ↔ label_id, CASCADE delete on both sides
  - `snooze_until TEXT` column on emails (ISO datetime, nullable)
  - `scheduled_send_at TEXT` column on emails (ISO datetime, nullable)
  - `contacts` table: id, email (unique), name, frequency (send+receive count), last_seen
  - `pending_alarms` table: id, type, payload (JSON string), fire_at (ISO datetime)
  - Indexes on all new time-based + join columns
- Non-functional:
  - Migrations must be idempotent (txn wrapper, name-checked by `applyMigrations`)
  - Schema.ts updated to match for Drizzle type safety

## Architecture

```
workers/durableObject/migrations.ts   ← add migrations 9–13
workers/db/schema.ts                  ← add Drizzle table definitions
```

Migration numbers (current max = 8):
- **9**: labels + email_labels tables
- **10**: snooze_until + scheduled_send_at columns on emails
- **11**: contacts table
- **12**: pending_alarms table
- **13**: indexes (idx_email_labels_email, idx_email_labels_label, idx_contacts_email, idx_pending_alarms_fire_at)

## Related Code Files

- Modify: `workers/durableObject/migrations.ts`
- Modify: `workers/db/schema.ts`

## Implementation Steps

1. **Open `workers/durableObject/migrations.ts`**, append after migration `8_add_folder_date_indexes`:

```ts
{
  name: "9_add_labels",
  sql: txn(`
    CREATE TABLE labels (
      id   TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#6366f1'
    );
    CREATE TABLE email_labels (
      email_id TEXT NOT NULL,
      label_id TEXT NOT NULL,
      PRIMARY KEY (email_id, label_id),
      FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE,
      FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE
    );
  `),
},
{
  name: "10_add_snooze_scheduled_send",
  sql: txn(`
    ALTER TABLE emails ADD COLUMN snooze_until TEXT;
    ALTER TABLE emails ADD COLUMN scheduled_send_at TEXT;
  `),
},
{
  name: "11_add_contacts",
  sql: txn(`
    CREATE TABLE contacts (
      id        TEXT PRIMARY KEY,
      email     TEXT NOT NULL UNIQUE,
      name      TEXT,
      frequency INTEGER NOT NULL DEFAULT 1,
      last_seen TEXT NOT NULL
    );
  `),
},
{
  name: "12_add_pending_alarms",
  sql: txn(`
    CREATE TABLE pending_alarms (
      id      TEXT PRIMARY KEY,
      type    TEXT NOT NULL,
      payload TEXT NOT NULL,
      fire_at TEXT NOT NULL
    );
  `),
},
{
  name: "13_add_phase2_indexes",
  sql: `
    CREATE INDEX IF NOT EXISTS idx_email_labels_email   ON email_labels(email_id);
    CREATE INDEX IF NOT EXISTS idx_email_labels_label   ON email_labels(label_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_email       ON contacts(email);
    CREATE INDEX IF NOT EXISTS idx_pending_alarms_fire  ON pending_alarms(fire_at ASC);
    CREATE INDEX IF NOT EXISTS idx_emails_snooze        ON emails(snooze_until);
    CREATE INDEX IF NOT EXISTS idx_emails_scheduled     ON emails(scheduled_send_at);
  `,
},
```

2. **Open `workers/db/schema.ts`**, add Drizzle table definitions:

```ts
export const labels = sqliteTable("labels", {
  id:    text("id").primaryKey(),
  name:  text("name").notNull().unique(),
  color: text("color").notNull().default("#6366f1"),
});

export const emailLabels = sqliteTable("email_labels", {
  email_id: text("email_id").notNull().references(() => emails.id, { onDelete: "cascade" }),
  label_id: text("label_id").notNull().references(() => labels.id, { onDelete: "cascade" }),
}, (t) => ({ pk: primaryKey({ columns: [t.email_id, t.label_id] }) }));

export const contacts = sqliteTable("contacts", {
  id:        text("id").primaryKey(),
  email:     text("email").notNull().unique(),
  name:      text("name"),
  frequency: integer("frequency").notNull().default(1),
  last_seen: text("last_seen").notNull(),
});

export const pendingAlarms = sqliteTable("pending_alarms", {
  id:      text("id").primaryKey(),
  type:    text("type").notNull(),
  payload: text("payload").notNull(),
  fire_at: text("fire_at").notNull(),
});
```

Also add `snooze_until` and `scheduled_send_at` to the existing `emails` table definition:
```ts
snooze_until:       text("snooze_until"),
scheduled_send_at:  text("scheduled_send_at"),
```

3. Update `app/types/index.ts` — add `Label`, `Contact`, and extend `Email`:

```ts
export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface Contact {
  id: string;
  email: string;
  name?: string;
  frequency: number;
  last_seen: string;
}
```

In `Email` interface:
```ts
snooze_until?: string | null;
scheduled_send_at?: string | null;
labels?: Label[];
```

## Success Criteria

- [ ] `applyMigrations` runs migrations 9–13 cleanly on a fresh DO (no SQL errors)
- [ ] All new tables/columns visible in schema.ts with correct Drizzle types
- [ ] `app/types/index.ts` exports `Label` and `Contact`
- [ ] `Email` type includes `snooze_until`, `scheduled_send_at`, `labels?`
- [ ] No TypeScript errors in schema.ts

## Snooze Exclusion Prep (prerequisite for Phase 3)

Add snooze exclusion to `getThreadedEmails` now, while the `snooze_until` column exists but has no data. Zero user impact; simplifies Phase 3 scope.

In `workers/durableObject/index.ts`, `getThreadedEmails()`:

**In the `folder_emails` CTE** (non-draft branch), add a WHERE condition:
```sql
WHERE folder_id = (SELECT id FROM folders WHERE name = ?1 OR id = ?1 LIMIT 1)
  AND (snooze_until IS NULL OR snooze_until <= datetime('now'))   -- ← add this line
```

**In `getEmails()`**, same condition for inbox folder:
```ts
if (folder === Folders.INBOX || folder === "inbox") {
  conditions.push(sql`(${schema.emails.snooze_until} IS NULL OR ${schema.emails.snooze_until} <= datetime('now'))`);
}
```

Add to `countThreadedEmails()` folder_emails CTE and `countEmails()` inbox conditions identically — pagination counts must match list queries.

## Risk Assessment

- Migration 10 uses `ALTER TABLE ADD COLUMN` (nullable) — safe in SQLite, no data migration needed
- Index-only migration 13 uses `CREATE INDEX IF NOT EXISTS` — no txn wrapper needed (idempotent)
- Drizzle `primaryKey()` import: ensure `import { primaryKey } from "drizzle-orm/sqlite-core"` is added
- Snooze CTE patch: update all four query methods (`getEmails`, `countEmails`, `getThreadedEmails`, `countThreadedEmails`) consistently — missing any one causes count/list mismatch
