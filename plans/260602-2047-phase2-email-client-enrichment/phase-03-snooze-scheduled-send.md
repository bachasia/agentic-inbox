---
phase: 3
title: "Snooze & Scheduled Send"
status: complete
priority: P1
effort: "5h"
dependencies: [phase-01-db-migrations-schema]
---

# Phase 3: Snooze & Scheduled Send

## Overview

Time-deferred email actions using the DO Alarm API. Snooze hides an email from inbox until a chosen datetime; scheduled send fires a drafted email at a chosen time. Both share a single `pending_alarms` queue because the DO runtime only allows one alarm per object.

## Requirements

- Functional:
  - **Snooze**: set `snooze_until` on any inbox email; email disappears from inbox; "Snoozed" virtual folder shows it; alarm fires → email returns to inbox + notification sent
  - **Scheduled send**: save draft with `scheduled_send_at`; DO alarm fires → calls `sendEmail()` + moves draft to Sent; datetime picker in ComposePanel
  - **Cancel snooze/schedule**: user can unsnooze (clear `snooze_until`) or delete a scheduled draft
  - Inbox query must exclude snoozed emails (`snooze_until IS NULL OR snooze_until <= now()`)
  - "Snoozed" virtual folder: query `WHERE snooze_until > datetime('now')`
  - "Scheduled" virtual folder: query `WHERE scheduled_send_at IS NOT NULL AND folder_id = 'draft'`
- Non-functional:
  - Alarm fires within 60s of target time (CF DO guarantee)
  - If alarm fires while email already deleted → silently skip
  - Never lose a scheduled send (alarm re-armed after each processing cycle)

## Architecture

```
DO alarm queue pattern
  pending_alarms table  ← INSERT on snooze/schedule
  alarm() handler       ← pops earliest entry, executes, re-arms

Snooze flow:
  POST /emails/:id/snooze { until }
    → UPDATE emails SET snooze_until = until
    → INSERT pending_alarms (type='snooze', payload={emailId}, fire_at=until)
    → ctx.storage.setAlarm(new Date(until))

alarm() on snooze:
    → UPDATE emails SET snooze_until = NULL, folder_id = 'inbox'
    → fire notification (optional)
    → re-arm for next pending_alarm

Scheduled send flow:
  POST /drafts  (or PUT /drafts/:id/schedule { sendAt })
    → UPDATE emails SET scheduled_send_at = sendAt
    → INSERT pending_alarms (type='send', payload={emailId, mailboxId}, fire_at=sendAt)
    → ctx.storage.setAlarm(new Date(sendAt))

alarm() on send:
    → fetch draft email + mailbox settings from R2
    → call sendEmail() (existing email-sender module)
    → move draft to Sent folder
    → re-arm
```

## Validated Decisions

- **`sendEmail` import**: use static top-level import (`import { sendEmail } from "../email-sender"`) at the top of `workers/durableObject/index.ts`. Do NOT use `import()` dynamic import inside `alarm()` — Cloudflare Workers bundle statically and dynamic imports inside DO methods may not resolve correctly at runtime.
- **SnoozePicker timezone**: quick-pick times ("Tonight 6pm", "Tomorrow 9am") are calculated using the browser's local timezone via `new Date()`. The resulting `Date` is converted to UTC ISO string (`date.toISOString()`) before being sent to the API. The DO stores and compares ISO strings in UTC — no server-side timezone conversion needed.
- **Snooze CTE exclusion**: already handled in Phase 1. Phase 3 only needs to implement `snoozeEmail()` / `alarm()` — `getThreadedEmails` and `getEmails` inbox filters are already patched.

## Related Code Files

- Modify: `workers/durableObject/index.ts` — add alarm queue methods + `alarm()` handler
- Modify: `workers/index.ts` — snooze + schedule API routes
- Modify: `workers/app.ts` — export `alarm` handler from MailboxDO (already part of DurableObject class)
- Modify: `app/services/api.ts` — snooze + schedule methods
- Modify: `app/queries/emails.ts` — pass snooze filter + virtual folders
- Modify: `app/components/Sidebar.tsx` — Snoozed + Scheduled virtual folder links
- Modify: `app/components/email-panel/EmailPanelToolbar.tsx` — Snooze button
- Modify: `app/components/ComposePanel.tsx` — Scheduled send datetime input
- Modify: `app/hooks/useComposeForm.ts` — scheduledAt state + pass to save/send
- Create: `app/components/SnoozePicker.tsx` — datetime quick-pick + custom input

## Implementation Steps

### 1. DO Alarm Queue (`workers/durableObject/index.ts`)

**Alarm queue helper methods:**

```ts
// ── Alarm queue ───────────────────────────────────────────────────

async #enqueueAlarm(type: string, payload: Record<string, string>, fireAt: string) {
  const id = crypto.randomUUID();
  this.ctx.storage.sql.exec(
    `INSERT INTO pending_alarms (id, type, payload, fire_at) VALUES (?, ?, ?, ?)`,
    id, type, JSON.stringify(payload), fireAt,
  );
  // setAlarm only re-arms if new time is earlier than existing alarm
  const existing = await this.ctx.storage.getAlarm();
  const newTime = new Date(fireAt).getTime();
  if (!existing || newTime < existing) {
    await this.ctx.storage.setAlarm(newTime);
  }
}

async #dequeueEarliestAlarm() {
  const rows = [...this.ctx.storage.sql.exec(
    `SELECT * FROM pending_alarms ORDER BY fire_at ASC LIMIT 1`,
  )] as any[];
  return rows[0] ?? null;
}

async #deleteAlarm(id: string) {
  this.ctx.storage.sql.exec(`DELETE FROM pending_alarms WHERE id = ?`, id);
}

async #rearmNextAlarm() {
  const next = await this.#dequeueEarliestAlarm();
  if (next) await this.ctx.storage.setAlarm(new Date(next.fire_at).getTime());
}
```

**`alarm()` handler** (required by Cloudflare DO runtime — must be a public method):

```ts
async alarm() {
  const entry = await this.#dequeueEarliestAlarm();
  if (!entry) return;

  const now = new Date().toISOString();
  if (entry.fire_at > now) {
    // Not yet due — re-arm and wait
    await this.ctx.storage.setAlarm(new Date(entry.fire_at).getTime());
    return;
  }

  await this.#deleteAlarm(entry.id);
  const payload = JSON.parse(entry.payload) as Record<string, string>;

  try {
    if (entry.type === "snooze") {
      await this.#processSnoozeAlarm(payload.emailId);
    } else if (entry.type === "send") {
      await this.#processScheduledSend(payload.emailId, payload.mailboxId);
    }
  } catch (e) {
    console.error(`alarm() failed for type=${entry.type}:`, (e as Error).message);
  }

  await this.#rearmNextAlarm();
}

async #processSnoozeAlarm(emailId: string) {
  const email = this.db.select({ id: schema.emails.id })
    .from(schema.emails).where(eq(schema.emails.id, emailId)).get();
  if (!email) return; // deleted — skip
  this.ctx.storage.sql.exec(
    `UPDATE emails SET snooze_until = NULL, folder_id = 'inbox' WHERE id = ?`,
    emailId,
  );
}

async #processScheduledSend(emailId: string, mailboxId: string) {
  const email = this.db.select().from(schema.emails)
    .where(eq(schema.emails.id, emailId)).get();
  if (!email || email.folder_id !== "draft") return; // already sent/deleted

  // Fetch mailbox settings for from-name and signature
  const settingsObj = await this.env.BUCKET.get(`mailboxes/${mailboxId}.json`);
  const settings = settingsObj ? await settingsObj.json() as Record<string, any> : {};

  // Build and fire the email (reuse existing sendEmail from email-sender.ts)
  // sendEmail is imported statically at module top — no dynamic import
  await sendEmail(this.env.EMAIL, {
    to: email.recipient,
    from: { name: settings.fromName || mailboxId, email: mailboxId },
    subject: email.subject || "",
    html: email.body || "",
  });

  // Move draft → sent
  this.ctx.storage.sql.exec(
    `UPDATE emails SET folder_id = 'sent', scheduled_send_at = NULL, read = 1 WHERE id = ?`,
    emailId,
  );
}
```

**Snooze DO methods:**

```ts
async snoozeEmail(emailId: string, until: string) {
  this.ctx.storage.sql.exec(
    `UPDATE emails SET snooze_until = ? WHERE id = ?`, until, emailId,
  );
  await this.#enqueueAlarm("snooze", { emailId }, until);
  return true;
}

async unsnoozeEmail(emailId: string) {
  this.ctx.storage.sql.exec(
    `UPDATE emails SET snooze_until = NULL WHERE id = ?`, emailId,
  );
  // Remove pending snooze alarm for this email
  this.ctx.storage.sql.exec(
    `DELETE FROM pending_alarms WHERE type = 'snooze' AND json_extract(payload, '$.emailId') = ?`,
    emailId,
  );
}

async scheduleEmail(emailId: string, sendAt: string, mailboxId: string) {
  this.ctx.storage.sql.exec(
    `UPDATE emails SET scheduled_send_at = ? WHERE id = ?`, sendAt, emailId,
  );
  await this.#enqueueAlarm("send", { emailId, mailboxId }, sendAt);
  return true;
}

async cancelScheduledEmail(emailId: string) {
  this.ctx.storage.sql.exec(
    `UPDATE emails SET scheduled_send_at = NULL WHERE id = ?`, emailId,
  );
  this.ctx.storage.sql.exec(
    `DELETE FROM pending_alarms WHERE type = 'send' AND json_extract(payload, '$.emailId') = ?`,
    emailId,
  );
}
```

**Update `getEmails` inbox filter** — add to WHERE conditions when folder is inbox:
```ts
// Exclude snoozed emails from inbox view
if (folder === Folders.INBOX || folder === "inbox") {
  conditions.push(sql`(${schema.emails.snooze_until} IS NULL OR ${schema.emails.snooze_until} <= datetime('now'))`);
}
```

**Virtual folder queries** — add to MailboxDO:
```ts
async getSnoozedEmails(page = 1, limit = 25) {
  // SELECT * FROM emails WHERE snooze_until > datetime('now') ORDER BY snooze_until ASC
}
async getScheduledEmails(page = 1, limit = 25) {
  // SELECT * FROM emails WHERE scheduled_send_at IS NOT NULL AND folder_id = 'draft' ORDER BY scheduled_send_at ASC
}
```

### 2. API Routes (`workers/index.ts`)

```ts
app.post("/api/v1/mailboxes/:mailboxId/emails/:id/snooze", async (c: AppContext) => {
  const { until } = await c.req.json() as { until: string };
  if (!until) return c.json({ error: "until required" }, 400);
  const stub = c.var.mailboxStub as any;
  await stub.snoozeEmail(c.req.param("id")!, until);
  return c.json({ status: "snoozed", until });
});

app.delete("/api/v1/mailboxes/:mailboxId/emails/:id/snooze", async (c: AppContext) => {
  await (c.var.mailboxStub as any).unsnoozeEmail(c.req.param("id")!);
  return c.body(null, 204);
});

app.post("/api/v1/mailboxes/:mailboxId/emails/:id/schedule", async (c: AppContext) => {
  const mailboxId = c.req.param("mailboxId")!;
  const { sendAt } = await c.req.json() as { sendAt: string };
  await (c.var.mailboxStub as any).scheduleEmail(c.req.param("id")!, sendAt, mailboxId);
  return c.json({ status: "scheduled", sendAt });
});

app.delete("/api/v1/mailboxes/:mailboxId/emails/:id/schedule", async (c: AppContext) => {
  await (c.var.mailboxStub as any).cancelScheduledEmail(c.req.param("id")!);
  return c.body(null, 204);
});

app.get("/api/v1/mailboxes/:mailboxId/snoozed", async (c: AppContext) => {
  const stub = c.var.mailboxStub as any;
  const emails = await stub.getSnoozedEmails(intQuery(c, "page"), intQuery(c, "limit"));
  return c.json({ emails, totalCount: emails.length });
});

app.get("/api/v1/mailboxes/:mailboxId/scheduled", async (c: AppContext) => {
  const stub = c.var.mailboxStub as any;
  const emails = await stub.getScheduledEmails(intQuery(c, "page"), intQuery(c, "limit"));
  return c.json({ emails, totalCount: emails.length });
});
```

### 3. API Client (`app/services/api.ts`)

```ts
snoozeEmail: (mailboxId: string, emailId: string, until: string) =>
  post<void>(`/api/v1/mailboxes/${mailboxId}/emails/${emailId}/snooze`, { until }),
unsnoozeEmail: (mailboxId: string, emailId: string) =>
  del<void>(`/api/v1/mailboxes/${mailboxId}/emails/${emailId}/snooze`),
scheduleEmail: (mailboxId: string, emailId: string, sendAt: string) =>
  post<void>(`/api/v1/mailboxes/${mailboxId}/emails/${emailId}/schedule`, { sendAt }),
cancelScheduledEmail: (mailboxId: string, emailId: string) =>
  del<void>(`/api/v1/mailboxes/${mailboxId}/emails/${emailId}/schedule`),
listSnoozed: (mailboxId: string) =>
  get<EmailListResponse>(`/api/v1/mailboxes/${mailboxId}/snoozed`),
listScheduled: (mailboxId: string) =>
  get<EmailListResponse>(`/api/v1/mailboxes/${mailboxId}/scheduled`),
```

### 4. `SnoozePicker.tsx` Component

Quick-pick buttons + custom datetime input:
```
[ In 1 hour ] [ Tonight 6pm ] [ Tomorrow 9am ] [ Next week ]
[ Custom: <datetime-local input> ]  [ Snooze ]
```
On confirm: calls `useSnoozeEmail` mutation. Rendered as popover in `EmailPanelToolbar`.

### 5. Frontend Integration

**`EmailPanelToolbar`**: Add clock/snooze icon button → opens `<SnoozePicker>` popover. Show "Snoozed until X" badge if `email.snooze_until` set.

**`ComposePanel` / `useComposeForm`**: Add "Send later" toggle. When enabled, shows `<input type="datetime-local">`. On send: calls `scheduleEmail()` instead of immediate send.

**`Sidebar`**: Add "Snoozed" and "Scheduled" virtual folder links with moon/clock icons below system folders. Snoozed count from query result length.

**`email-list.tsx`**: Show "Snoozed until X" badge on snoozed email rows. Show "Sends at X" badge on scheduled drafts.

## Success Criteria

- [ ] Snooze an email → disappears from inbox immediately
- [ ] Snoozed folder shows the email with `snooze_until` time
- [ ] DO alarm fires at the right time → email reappears in inbox
- [ ] Cancel snooze → email returns to inbox immediately
- [ ] Compose with "send later" → draft saved with `scheduled_send_at`
- [ ] DO alarm fires → email sent, appears in Sent folder, removed from Scheduled
- [ ] Multiple pending alarms queue correctly; alarm re-arms for next event
- [ ] Deleting a snoozed/scheduled email doesn't crash alarm handler (graceful skip)

## Risk Assessment

- **`sendEmail` import** (resolved): use static `import { sendEmail } from "../email-sender"` at module top. Add it to the existing import block in `workers/durableObject/index.ts`.
- **Alarm not re-arming**: if `alarm()` throws before `#rearmNextAlarm()`, the queue stalls. Wrap the whole handler in try/catch with guaranteed re-arm in `finally`.
- **json_extract in SQLite**: available in CF DO SQLite. If not, store emailId as a plain column instead of nested JSON.
- **`scheduled_send_at` vs draft delete**: user may delete the draft; `#processScheduledSend` checks `folder_id === 'draft'` before sending.
