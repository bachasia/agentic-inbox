---
phase: 1
title: "Backend mailbox summary"
status: pending
priority: P2
effort: "1h"
dependencies: []
---

# Phase 1: Backend Mailbox Summary

## Overview

Add `getMailboxSummary()` method to MailboxDO and enrich `GET /api/v1/mailboxes` to return unread counts, latest email info, and settings status per mailbox.

## Requirements

- Functional: Return inbox unread count + latest email (sender, subject, date) + status flags (forwardingEnabled, autoReplyEnabled) per mailbox
- Non-functional: All DO calls in parallel — response time ≤ 200ms for 5 mailboxes

## Related Code Files

- Modify: `workers/durableObject/index.ts` — add `getMailboxSummary()`
- Modify: `workers/index.ts` — enrich `GET /api/v1/mailboxes` endpoint
- Modify: `workers/lib/email-helpers.ts` — update `listMailboxes()` return type or add settings fetch

## Implementation Steps

1. **Add `getMailboxSummary()` to MailboxDO** (`workers/durableObject/index.ts`):
   ```ts
   async getMailboxSummary() {
     const inboxUnread = this.db
       .select({ count: sql<number>`COUNT(*)` })
       .from(schema.emails)
       .where(and(
         eq(schema.emails.folder_id, 'inbox'),
         eq(schema.emails.read, 0)
       ))
       .get();

     const latestEmail = this.db
       .select({
         sender: schema.emails.sender,
         subject: schema.emails.subject,
         date: schema.emails.date,
       })
       .from(schema.emails)
       .where(eq(schema.emails.folder_id, 'inbox'))
       .orderBy(desc(schema.emails.date))
       .limit(1)
       .get();

     return {
       inboxUnreadCount: inboxUnread?.count ?? 0,
       latestEmail: latestEmail ?? null,
     };
   }
   ```

2. **Enrich `GET /api/v1/mailboxes`** (`workers/index.ts:102-105`):
   ```ts
   app.get("/api/v1/mailboxes", async (c) => {
     const allMailboxes = await listMailboxes(c.env.BUCKET);
     const enriched = await Promise.all(
       allMailboxes.map(async (m) => {
         const stub = c.env.MAILBOX.get(c.env.MAILBOX.idFromName(m.id));
         const [summary, settingsObj] = await Promise.all([
           (stub as any).getMailboxSummary(),
           c.env.BUCKET.get(`mailboxes/${m.id}.json`),
         ]);
         const settings = settingsObj ? await settingsObj.json() as Record<string, any> : null;
         return {
           ...m,
           name: settings?.fromName || m.id,
           summary,
           status: {
             forwardingEnabled: !!settings?.forwarding?.enabled,
             autoReplyEnabled: !!settings?.autoReply?.enabled,
           },
         };
       })
     );
     return c.json(enriched);
   });
   ```

3. **Verify** the enriched response shape matches the frontend type (Phase 2).

## Success Criteria

- [ ] `getMailboxSummary()` returns `{inboxUnreadCount, latestEmail}` with single efficient query
- [ ] `GET /api/v1/mailboxes` returns enriched objects with summary + status flags (not full settings)
- [ ] DO calls run in parallel via `Promise.all`
- [ ] Typecheck passes

## Risk Assessment

- **DO cold start**: First call to a DO may have ~50ms latency. Mitigated by parallel calls.
- **Empty mailbox**: `latestEmail` must gracefully return `null` when inbox is empty.
