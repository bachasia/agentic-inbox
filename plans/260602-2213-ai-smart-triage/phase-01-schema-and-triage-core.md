# Phase 3.1: Schema & Triage Core

**Priority:** High
**Status:** Pending
**Depends on:** Migration 13 (phase 2 indexes)

## Context Links

- [Current migrations](../../workers/durableObject/migrations.ts)
- [AI utilities](../../workers/lib/ai.ts)
- [Email types](../../app/types/index.ts)
- [DB schema](../../workers/db/schema.ts)
- [DO methods](../../workers/durableObject/index.ts)

## Overview

Add triage columns to the emails table, create the core `triageEmail()` AI function, and expose DO methods for reading/writing triage data. This is the foundation that phases 3.2-3.4 build on.

## Key Insights

- `@cf/meta/llama-4-scout-17b-16e-instruct` already used for draft verification — proven reliable for structured tasks
- Single AI call with structured output (JSON mode) returns all triage fields at once
- Existing labels infrastructure handles category labels — no new tables needed
- Email body already stripped to plaintext for prompt injection scanning — reuse `stripHtmlToText()`

## Requirements

### Functional
- Migration 14: add `triage_category`, `triage_priority`, `triage_summary`, `triage_confidence` columns to emails
- `triageEmail()` function in `workers/lib/ai.ts` — returns structured triage result
- DO methods: `setEmailTriage()`, `getEmailTriage()`
- TypeScript types for triage data on frontend + backend

### Non-functional
- Triage AI call must complete in < 2s (use fast model, not kimi-k2.5)
- Fail-open: AI errors leave triage fields null, email still arrives
- Max 500 tokens input to triage prompt (truncate long emails)

## Architecture

```
triageEmail(ai: Ai, email: {subject, body, sender}) → TriageResult
  ├─ Truncate body to ~500 tokens
  ├─ Call llama-4-scout with structured output prompt
  ├─ Parse JSON response
  └─ Return { category, priority, confidence, reason }

TriageResult:
  category:   "personal" | "business" | "newsletter" | "notification" | "spam" | "other"
  priority:   1 (low) | 2 (normal) | 3 (high) | 4 (urgent)
  confidence: 0.0 - 1.0
  reason:     string (1 sentence)
```

## Related Code Files

### Modify
- `workers/durableObject/migrations.ts` — add migration 14
- `workers/db/schema.ts` — add triage columns to emails table
- `workers/lib/ai.ts` — add `triageEmail()` function
- `workers/durableObject/index.ts` — add `setEmailTriage()`, `getEmailTriage()` methods
- `app/types/index.ts` — add triage fields to Email interface

### No new files needed

## Implementation Steps

1. **Migration 14** in `workers/durableObject/migrations.ts`:
   ```sql
   ALTER TABLE emails ADD COLUMN triage_category TEXT;
   ALTER TABLE emails ADD COLUMN triage_priority INTEGER;
   ALTER TABLE emails ADD COLUMN triage_summary TEXT;
   ALTER TABLE emails ADD COLUMN triage_confidence REAL;
   CREATE INDEX idx_emails_triage_priority ON emails(triage_priority);
   CREATE INDEX idx_emails_triage_category ON emails(triage_category);
   ```

2. **Schema columns** in `workers/db/schema.ts`:
   - Add `triage_category`, `triage_priority`, `triage_summary`, `triage_confidence` to emails table definition

3. **`triageEmail()` function** in `workers/lib/ai.ts`:
   - Input: `ai: Ai`, `email: { subject: string, body: string, sender: string }`
   - Truncate body to first 2000 chars (plaintext)
   - System prompt instructs model to return JSON with category, priority, confidence, reason
   - Parse response, validate fields, return typed result
   - On failure: return null (fail-open)

4. **DO methods** in `workers/durableObject/index.ts`:
   - `setEmailTriage(emailId, triage)` — UPDATE emails SET triage_* columns
   - `getEmailTriage(emailId)` — SELECT triage_* columns for one email

5. **Frontend types** in `app/types/index.ts`:
   - Add to Email interface: `triage_category?: string | null`, `triage_priority?: number | null`, `triage_summary?: string | null`, `triage_confidence?: number | null`

## Todo List

- [ ] Add migration 14 with triage columns + indexes
- [ ] Add triage columns to Drizzle schema
- [ ] Implement `triageEmail()` AI function
- [ ] Add DO methods `setEmailTriage()` and `getEmailTriage()`
- [ ] Add triage fields to frontend Email type
- [ ] Verify build compiles with `npm run build` or typecheck

## Success Criteria

- Migration 14 applies cleanly on existing DBs
- `triageEmail()` returns valid TriageResult for test inputs
- Triage columns accessible via DO methods
- Build compiles without type errors

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| llama-4-scout JSON output inconsistent | Triage data corrupt | Validate + sanitize response, fallback to null |
| Column addition fails on large DBs | Migration blocks deploy | ALTER TABLE ADD COLUMN is instant in SQLite (no table rewrite) |

## Security Considerations

- Triage prompt must not leak email content to external services — Workers AI runs on Cloudflare infra (no external calls)
- `triage_summary` stored in DB could surface sensitive content — acceptable for personal email client
