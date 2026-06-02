# Phase 5.5: Outbound Webhooks & Email Analytics

**Priority:** Low
**Status:** Pending
**Depends on:** Phase 5.4 (rules engine — webhooks partially implemented as rule action), existing alarm infrastructure

## Context Links

- [Alarm handler](../../workers/durableObject/index.ts) — `alarm()` method for daily digest
- [Notifications](../../workers/lib/notifications.ts) — Telegram/Discord helpers
- [Settings page](../../app/routes/settings.tsx) — where analytics toggle and webhook config go
- [Contacts table](../../workers/db/schema.ts) — frequency data for top contacts

## Overview

Two features bundled together: (1) standalone webhook registrations for event-driven integrations, and (2) daily email analytics (sent/received trends, response times, busiest hours, top contacts) displayed as a simple dashboard.

## Key Insights

- Webhooks as rule actions (Phase 5.4) handle the common case. Standalone webhooks add a dedicated registration for broader events (email.sent, label.applied) not tied to rules.
- Analytics are daily aggregates computed by a DO alarm at midnight. Stored in `email_analytics` table. Frontend renders with lightweight charts.
- No external charting library needed — use CSS-based bar charts or inline SVG. Keeps bundle small.
- Analytics scope: last 30 days of daily aggregates. Older rows auto-pruned by the nightly alarm.

## Requirements

### Functional

#### Webhooks
- Migration 19: `webhooks` table
- DO CRUD: `createWebhook()`, `listWebhooks()`, `updateWebhook()`, `deleteWebhook()`
- Event types: `email.received`, `email.sent`, `email.deleted`, `label.applied`, `rule.triggered`
- Fire webhooks on matching events with retry (1x after 30s)
- API endpoints: CRUD + test webhook
- Settings UI: webhook management section

#### Analytics
- Migration 19 (same migration): `email_analytics` table
- DO method: `computeDailyAnalytics()` — aggregate yesterday's stats
- Daily alarm type `compute-analytics` fires at midnight, re-arms
- API endpoint: `GET /api/v1/mailboxes/:id/analytics?days=30`
- Frontend: analytics dashboard route or settings section

### Non-functional
- Webhook POST timeout: 10s, retry once after 30s on failure
- Analytics computation < 5s (SQL aggregation over 1 day's emails)
- Dashboard loads < 1s (30 pre-computed rows)

## Architecture

```
webhooks table:
  id          TEXT PRIMARY KEY
  url         TEXT NOT NULL
  events      TEXT NOT NULL          -- JSON: ["email.received", "email.sent"]
  enabled     INTEGER DEFAULT 1
  secret      TEXT                   -- optional HMAC secret for signature
  created_at  TEXT NOT NULL
  updated_at  TEXT NOT NULL

email_analytics table:
  date          TEXT NOT NULL PRIMARY KEY   -- YYYY-MM-DD
  emails_received  INTEGER DEFAULT 0
  emails_sent      INTEGER DEFAULT 0
  emails_archived  INTEGER DEFAULT 0
  avg_response_hours REAL              -- avg time to reply to received emails
  top_senders      TEXT                -- JSON: [{ email, count }] top 5
  busiest_hour     INTEGER             -- 0-23
  computed_at      TEXT NOT NULL

Webhook flow:
  Event occurs (email received, sent, deleted, label applied)
    → DO.fireWebhooks(eventType, payload)
    → SELECT FROM webhooks WHERE enabled = 1 AND events LIKE '%eventType%'
    → For each: ctx.waitUntil(fetch(url, { POST, body, headers: { X-Signature: hmac } }))
    → On failure: schedule retry via setTimeout or alarm

Analytics flow:
  DO alarm fires at midnight (type: "compute-analytics")
    → SQL: count emails by folder where date = yesterday
    → SQL: avg response time for yesterday's threads
    → SQL: top 5 senders by count
    → SQL: busiest hour (GROUP BY strftime('%H', date))
    → INSERT into email_analytics
    → DELETE from email_analytics WHERE date < 30 days ago
    → Re-arm alarm for next midnight
```

## Related Code Files

### Modify
- `workers/durableObject/migrations.ts` — migration 19 (webhooks + email_analytics)
- `workers/db/schema.ts` — add both tables
- `workers/durableObject/index.ts` — webhook CRUD, analytics computation, alarm handler for analytics, `fireWebhooks()` event dispatcher
- `workers/index.ts` — webhook and analytics API endpoints, fire webhooks on email events
- `app/services/api.ts` — webhook and analytics API calls
- `app/types/index.ts` — Webhook, EmailAnalytics interfaces
- `app/routes/settings.tsx` — webhooks management section

### Create
- `workers/lib/webhooks.ts` — webhook firing logic (HMAC signature, retry, validation)
- `app/components/AnalyticsDashboard.tsx` — charts and stats display
- `app/queries/analytics.ts` — React Query hook for analytics
- `app/queries/webhooks.ts` — React Query hooks for webhook CRUD

## Implementation Steps

1. **Migration 19** in `workers/durableObject/migrations.ts`:
   ```sql
   CREATE TABLE webhooks (
     id         TEXT NOT NULL PRIMARY KEY,
     url        TEXT NOT NULL,
     events     TEXT NOT NULL,
     enabled    INTEGER NOT NULL DEFAULT 1,
     secret     TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   );

   CREATE TABLE email_analytics (
     date               TEXT NOT NULL PRIMARY KEY,
     emails_received    INTEGER NOT NULL DEFAULT 0,
     emails_sent        INTEGER NOT NULL DEFAULT 0,
     emails_archived    INTEGER NOT NULL DEFAULT 0,
     avg_response_hours REAL,
     top_senders        TEXT,
     busiest_hour       INTEGER,
     computed_at        TEXT NOT NULL DEFAULT (datetime('now'))
   );
   ```

2. **Drizzle schema** — add `webhooks` and `emailAnalytics` tables

3. **Frontend types** in `app/types/index.ts`:
   ```ts
   export interface Webhook {
     id: string;
     url: string;
     events: string[];
     enabled: boolean;
     secret?: string;
     createdAt: string;
     updatedAt: string;
   }
   export interface EmailAnalytics {
     date: string;
     emailsReceived: number;
     emailsSent: number;
     emailsArchived: number;
     avgResponseHours: number | null;
     topSenders: Array<{ email: string; count: number }>;
     busiestHour: number | null;
   }
   ```

4. **`workers/lib/webhooks.ts`** — webhook helpers:
   - `fireWebhook(url, secret, event, payload)` — POST with JSON body, `X-Webhook-Event` header, optional `X-Signature` HMAC-SHA256
   - `validateWebhookUrl(url)` — HTTPS check, no private IPs
   - `retryWebhook(url, secret, event, payload)` — single retry after 30s delay

5. **DO webhook CRUD** — standard create/list/update/delete on webhooks table

6. **`fireWebhooks(eventType, payload)` DO method**:
   - Query enabled webhooks matching event
   - Call `fireWebhook()` for each via `waitUntil()` — non-blocking
   - Log failures

7. **Integrate webhook firing into event points**:
   - `receiveEmail()` → `fireWebhooks('email.received', { emailId, from, subject })`
   - `sendEmail()` → `fireWebhooks('email.sent', { emailId, to, subject })`
   - `deleteEmail()` → `fireWebhooks('email.deleted', { emailId })`
   - `addLabelToEmail()` → `fireWebhooks('label.applied', { emailId, labelId, labelName })`
   - `evaluateAndApplyRules()` → `fireWebhooks('rule.triggered', { ruleId, ruleName, emailId })`

8. **`computeDailyAnalytics()` DO method**:
   ```sql
   -- Received yesterday
   SELECT COUNT(*) FROM emails WHERE folder != 'sent' AND folder != 'draft' AND date BETWEEN ? AND ?
   -- Sent yesterday
   SELECT COUNT(*) FROM emails WHERE folder = 'sent' AND date BETWEEN ? AND ?
   -- Archived yesterday
   SELECT COUNT(*) FROM emails WHERE folder = 'archive' AND date BETWEEN ? AND ?
   -- Avg response time
   SELECT AVG(...) -- same pattern as contact intelligence response time query
   -- Top senders
   SELECT sender, COUNT(*) as cnt FROM emails WHERE date BETWEEN ? AND ? GROUP BY sender ORDER BY cnt DESC LIMIT 5
   -- Busiest hour
   SELECT CAST(strftime('%H', date) AS INTEGER) as hour, COUNT(*) as cnt FROM emails WHERE date BETWEEN ? AND ? GROUP BY hour ORDER BY cnt DESC LIMIT 1
   ```

9. **Alarm handler** — add `compute-analytics` type:
   - Fires at midnight → call `computeDailyAnalytics()` → prune rows > 30 days → re-arm for next midnight

10. **API endpoints**:
    - Webhooks: `GET/POST/PUT/DELETE /api/v1/mailboxes/:id/webhooks`
    - `POST /api/v1/mailboxes/:id/webhooks/:webhookId/test` — send test event
    - `GET /api/v1/mailboxes/:id/analytics?days=30` — return analytics rows

11. **Frontend**:
    - `app/queries/webhooks.ts` — CRUD hooks
    - `app/queries/analytics.ts` — `useEmailAnalytics(mailboxId, days)`
    - `app/components/AnalyticsDashboard.tsx` — CSS bar charts for daily send/receive, stat cards for avg response time, top contacts list, busiest hour badge
    - Settings page: webhooks section (URL, events checkboxes, secret input, enable/disable toggle)
    - New route or settings tab for analytics dashboard

## Todo List

- [ ] Add migration 19 (webhooks + email_analytics tables)
- [ ] Add both tables to Drizzle schema
- [ ] Add Webhook and EmailAnalytics types to frontend
- [ ] Create `workers/lib/webhooks.ts` helper module
- [ ] Implement DO webhook CRUD methods
- [ ] Implement `fireWebhooks()` event dispatcher
- [ ] Integrate webhook firing into email event points
- [ ] Implement `computeDailyAnalytics()` DO method
- [ ] Add compute-analytics alarm type
- [ ] Add webhook API endpoints
- [ ] Add analytics API endpoint
- [ ] Add webhook management to settings UI
- [ ] Create AnalyticsDashboard component
- [ ] Create React Query hooks for webhooks and analytics
- [ ] Verify build compiles

## Success Criteria

- Webhooks fire within 5s of triggering event
- Test webhook button sends sample payload and shows success/failure
- Analytics dashboard shows 30-day trends with daily bars
- Analytics alarm computes nightly without manual trigger
- Old analytics rows auto-pruned after 30 days
- No performance impact on email pipeline (all webhook firing is non-blocking)

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Webhook target is slow/down | Delayed retry, lost events | Fire via waitUntil, single retry. Log failures. No blocking. |
| SSRF via webhook URL | Security | URL validation: HTTPS only, no private IPs |
| Analytics alarm misses midnight (DO hibernation) | Missing day's stats | Alarm checks for gaps on fire — backfill missing days if needed |
| Large mailbox analytics computation is slow | Slow alarm | Aggregate only yesterday, not full history. Index on date column. |

## Security Considerations

- Webhook URLs validated: HTTPS only, no private/internal IPs
- Optional HMAC-SHA256 signature for webhook payload verification
- Webhook secret stored in DO SQLite, not exposed in API responses (write-only after creation)
- Analytics data is aggregated — no individual email content exposed
- Max 10 webhooks per mailbox to prevent abuse
