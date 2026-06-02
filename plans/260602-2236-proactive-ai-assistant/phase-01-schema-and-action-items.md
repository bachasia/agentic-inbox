# Phase 4.1: Schema & Foundation

**Priority:** High
**Status:** Pending
**Depends on:** Migration 14 (Phase 3.1 triage columns)

## Context Links

- [Current migrations](../../workers/durableObject/migrations.ts)
- [DB schema](../../workers/db/schema.ts)
- [DO methods](../../workers/durableObject/index.ts)
- [Frontend types](../../app/types/index.ts)
- [pending_alarms table](../../workers/durableObject/migrations.ts#L208-L224)

## Overview

Create the `action_items` table and add the `digest_alarm_at` mailbox setting. Expose DO CRUD methods for action items and add frontend types. This is the data layer all Phase 4 features build on.

## Key Insights

- `pending_alarms` table already exists (migration 12) with `id`, `type`, `payload`, `fire_at` — Phase 4 only adds new alarm types (`remind-unanswered`, `daily-digest`)
- Unanswered tracking needs no new table: detect via existing thread + email data (sent email in thread with no subsequent reply from same address)
- `action_items` needs `completed_at` not just `completed` bool — lets digest report completions vs. lingering items
- Mailbox settings (R2 JSON) already used for Telegram/Discord config — add `digestTime` and `unansweredDays` to same blob

## Requirements

### Functional
- Migration 15: create `action_items` table with full schema
- DO methods: `createActionItem()`, `listActionItems()`, `completeActionItem()`, `deleteActionItem()`
- TypeScript frontend type `ActionItem`
- Mailbox settings schema extended: `digestTime` (HH:MM string, default `"08:00"`), `unansweredDays` (number, default `3`)

### Non-functional
- `action_items` indexes on `email_id` and `completed_at` for fast queries
- All DO methods fail-safe (no throw on empty results)

## Architecture

```
action_items table:
  id           TEXT PRIMARY KEY     -- nanoid
  email_id     TEXT NOT NULL        -- source email
  description  TEXT NOT NULL        -- extracted task text
  due_date     TEXT                 -- ISO date or NULL
  completed_at TEXT                 -- ISO datetime or NULL
  created_at   TEXT NOT NULL

ActionItem (frontend):
  id, emailId, description, dueDate?, completedAt?, createdAt
```

## Related Code Files

### Modify
- `workers/durableObject/migrations.ts` — add migration 15
- `workers/db/schema.ts` — add action_items table definition
- `workers/durableObject/index.ts` — add 4 CRUD methods
- `app/types/index.ts` — add ActionItem interface

### No new files needed

## Implementation Steps

1. **Migration 15** in `workers/durableObject/migrations.ts`:
   ```sql
   CREATE TABLE action_items (
     id          TEXT NOT NULL PRIMARY KEY,
     email_id    TEXT NOT NULL,
     description TEXT NOT NULL,
     due_date    TEXT,
     completed_at TEXT,
     created_at  TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX idx_action_items_email    ON action_items(email_id);
   CREATE INDEX idx_action_items_pending  ON action_items(completed_at) WHERE completed_at IS NULL;
   ```

2. **Drizzle schema** in `workers/db/schema.ts`:
   - Add `actionItems` table mirroring the SQL above

3. **DO CRUD methods** in `workers/durableObject/index.ts`:
   - `createActionItem(item: { emailId, description, dueDate? })` — INSERT, return generated id
   - `listActionItems(opts: { pendingOnly?: boolean, limit?: number })` — SELECT with optional WHERE
   - `completeActionItem(id: string)` — UPDATE completed_at = datetime('now')
   - `deleteActionItem(id: string)` — DELETE by id

4. **Frontend types** in `app/types/index.ts`:
   ```ts
   export interface ActionItem {
     id: string;
     emailId: string;
     description: string;
     dueDate?: string | null;
     completedAt?: string | null;
     createdAt: string;
   }
   ```

5. **Mailbox settings defaults** — document in code that `digestTime` and `unansweredDays` are read from R2 mailbox settings JSON; no migration needed (settings are a free-form JSON blob in R2)

## Todo List

- [ ] Add migration 15 with action_items table + indexes
- [ ] Add action_items to Drizzle schema
- [ ] Implement `createActionItem()` DO method
- [ ] Implement `listActionItems()` DO method
- [ ] Implement `completeActionItem()` DO method
- [ ] Implement `deleteActionItem()` DO method
- [ ] Add ActionItem interface to frontend types
- [ ] Verify build compiles with typecheck

## Success Criteria

- Migration 15 applies cleanly after migration 14
- All 4 DO methods callable without runtime errors
- ActionItem type importable in frontend components
- Build clean

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Partial index (`WHERE completed_at IS NULL`) unsupported in SQLite version | Index silently ignored | CF DO uses SQLite 3.37+; partial indexes supported |
| Schema drift between Drizzle and raw SQL | Type errors at runtime | Define schema in Drizzle first, derive migration SQL from it |

## Security Considerations

- `action_items` may contain extracted sensitive content — same security posture as `emails` table (DO-only access, no direct external exposure)
- No PII beyond what's already in emails
