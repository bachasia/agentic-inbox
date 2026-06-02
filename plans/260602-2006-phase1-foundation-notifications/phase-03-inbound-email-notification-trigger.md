---
phase: 3
title: "Inbound Email Notification Trigger"
status: pending
priority: P1
effort: "1h"
dependencies: [1, 2]
---

# Phase 3: Inbound Email Notification Trigger

## Overview

Wire the notification service (Phase 1) into the `receiveEmail()` handler so that every inbound email triggers a Telegram/Discord notification based on mailbox settings. Fires via `ctx.waitUntil()` alongside the existing agent auto-draft trigger.

## Requirements

- Functional: Every inbound email fires notification if any provider is enabled for that mailbox
- Functional: Notification includes sender and subject only (no body content — privacy: email content stays on Cloudflare)
- Non-functional: Non-blocking — uses `waitUntil()`, never delays email storage or agent trigger
- Non-functional: Notification failure must not affect email delivery or agent auto-draft

## Architecture

```
receiveEmail()
  → store email in DO (existing)
  → ctx.waitUntil(notifyNewEmail(...))          ← NEW
  → ctx.waitUntil(agentStub.fetch(/onNewEmail)) (existing)
```

## Related Code Files

- Modify: `workers/index.ts` — add notification trigger in `receiveEmail()` function (around line 405)
- Read: `workers/lib/notifications.ts` — import `notifyNewEmail`

## Implementation Steps

1. **Import notification module in `workers/index.ts`:**
   ```ts
   import { notifyNewEmail } from "./lib/notifications";
   ```

2. **Replace R2 `head()` with `get()` in `receiveEmail()`:**
   The existing code does `env.BUCKET.head()` to check mailbox existence, then we'd need a separate `get()` for notification settings. Optimize: replace the `head()` with `get()` — one R2 operation instead of two. If `get()` returns null, mailbox doesn't exist (same behavior).
   ```ts
   // Replace: if (!(await env.BUCKET.head(`mailboxes/${mailboxId}.json`))) { ... }
   // With:
   const settingsObj = await env.BUCKET.get(`mailboxes/${mailboxId}.json`);
   if (!settingsObj) { console.log(`Ignoring email for ${mailboxId}: mailbox does not exist`); return; }
   const settings = await settingsObj.json() as Record<string, any>;
   ```

3. **Fire notification via `waitUntil()`:**
   After `stub.createEmail(Folders.INBOX, ...)` (line ~403) and before the agent trigger, add:
   ```ts
   ctx.waitUntil(
     notifyNewEmail(settings.notifications, {
       sender: (parsedEmail.from?.address || "").toLowerCase(),
       senderName: parsedEmail.from?.name || undefined,
       subject: parsedEmail.subject || "(no subject)",
       mailboxId,
     }).catch(e => console.error("Notification failed:", e.message))
   );
   ```

4. **Run typecheck** to verify integration compiles. (`EmailNotificationMeta` type is already defined in Phase 1.)

## Success Criteria

- [ ] Inbound email triggers Telegram notification (if enabled) within 5 seconds
- [ ] Inbound email triggers Discord notification (if enabled) within 5 seconds
- [ ] Notification failure does not prevent email storage
- [ ] Notification failure does not prevent agent auto-draft
- [ ] No email body content sent to external services (subject + sender only)
- [ ] `npm run typecheck` passes

## Risk Assessment

- **R2 read optimization:** Replace existing `head()` + new `get()` with single `get()`. Net zero additional R2 calls — actually one fewer than the naive approach.
- **Race with auto-draft:** Both are independent `waitUntil()` calls. No interaction.
