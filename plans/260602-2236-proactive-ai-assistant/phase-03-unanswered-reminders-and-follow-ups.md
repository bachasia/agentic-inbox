# Phase 4.3: Unanswered Reminders & Follow-up Suggestions

**Priority:** High
**Status:** Pending
**Depends on:** Phase 4.1 (DO alarm infrastructure confirmed working), Phase 1 (Telegram/Discord notifications)

## Context Links

- [pending_alarms + alarm() handler](../../workers/durableObject/index.ts#L922-L968)
- [snoozeEmail / scheduleEmail alarm patterns](../../workers/durableObject/index.ts#L1007-L1038)
- [Notifications helper](../../workers/lib/notifications.ts)
- [sendEmail pipeline](../../workers/durableObject/index.ts)

## Overview

When the user sends an email, enqueue a `remind-unanswered` alarm. When the alarm fires, check if the thread has received a reply. If not, send a Telegram/Discord reminder and surface the email in agent context. Add a `getPendingFollowUps` agent tool for on-demand follow-up queries.

## Key Insights

- `#enqueueAlarm()` private method already handles the SQLite insert + `setAlarm()` call — new types just need a new handler branch in `alarm()`
- "Has a reply?" detection: query emails in same thread where `folder_id = 'inbox'` and `created_at > sent_email.created_at` — if any exist, the thread has replies; skip reminder
- Only remind once per sent email — after firing, alarm is deleted (existing pattern); no re-arm
- Configurable threshold via mailbox settings `unansweredDays` (default 3) — read from R2 JSON at send time, baked into `fire_at`
- "Follow-up suggestions" reuse same data as unanswered detection — `getPendingFollowUps` agent tool just queries sent emails > threshold with no reply

## Requirements

### Functional
- On `sendEmail()`: enqueue `remind-unanswered` alarm for `now + unansweredDays`
- `alarm()` handler: when type = `remind-unanswered`, check for reply; if none, send notification + store in agent chat context
- `getPendingFollowUps` agent tool: return list of sent emails older than threshold with no replies
- API endpoint `DELETE /api/v1/mailboxes/:id/emails/:id/follow-up-reminder` — cancel pending reminder for a sent email
- Settings UI: expose `unansweredDays` field in settings page

### Non-functional
- Alarm fires at most once per email — no re-arm
- Reply detection is a cheap SQLite query — no AI call required
- Notification message includes: subject, recipient, days since sent, direct link

## Architecture

```
sendEmail() additions (workers/durableObject/index.ts):
  after UPDATE emails SET folder_id='sent'...
  const settings = await this.#getMailboxSettings();  // R2 JSON
  const days = settings.unansweredDays ?? 3;
  const fireAt = new Date(Date.now() + days * 86400_000).toISOString();
  await this.#enqueueAlarm("remind-unanswered", { emailId }, fireAt);

alarm() handler — new branch:
  case "remind-unanswered": {
    const { emailId } = JSON.parse(entry.payload);
    const email = await this.#getEmail(emailId);
    if (!email || email.thread_id === null) break;
    const hasReply = await this.#threadHasReplyAfter(email.thread_id, email.created_at);
    if (hasReply) break;  // replied — skip
    await sendReminderNotification(settings, email);
    break;
  }

#threadHasReplyAfter(threadId, sentAt):
  SELECT COUNT(*) FROM emails
  WHERE thread_id = ? AND folder_id = 'inbox' AND created_at > ?
  → returns boolean

getPendingFollowUps agent tool:
  SELECT e.* FROM emails e
  WHERE e.folder_id = 'sent'
    AND e.created_at < datetime('now', '-' || ? || ' days')
    AND NOT EXISTS (
      SELECT 1 FROM emails r
      WHERE r.thread_id = e.thread_id
        AND r.folder_id = 'inbox'
        AND r.created_at > e.created_at
    )
  ORDER BY e.created_at ASC
  LIMIT 20
```

### Notification message format (Telegram)

```
⏰ No reply yet

Subject: {subject}
To: {recipient}
Sent: {N} days ago

Reply now: {deep link to thread}
```

## Related Code Files

### Modify
- `workers/durableObject/index.ts` — extend `alarm()` with `remind-unanswered` branch, add `#threadHasReplyAfter()`, extend `sendEmail()` to enqueue alarm, add `getPendingFollowUps()` method
- `workers/index.ts` — add `DELETE /emails/:id/follow-up-reminder` endpoint, register `getPendingFollowUps` agent tool
- `workers/lib/notifications.ts` — add `sendReminderNotification()` function
- `app/routes/settings.tsx` — add `unansweredDays` field to notification settings section

### No new files needed

## Implementation Steps

1. **`#threadHasReplyAfter(threadId, sentAt)`** private method in `workers/durableObject/index.ts`:
   - Raw SQL query as shown in architecture
   - Returns `boolean`

2. **`getPendingFollowUps(days: number)`** DO method:
   - Parameterized SQL query (architecture above)
   - Returns `Email[]`
   - Used by both agent tool and could power a future UI view

3. **Extend `sendEmail()`** in `workers/durableObject/index.ts`:
   - After setting `folder_id = 'sent'`, read `unansweredDays` from settings
   - Call `this.#enqueueAlarm("remind-unanswered", { emailId }, fireAt)`

4. **`alarm()` handler branch** in `workers/durableObject/index.ts`:
   - Add `case "remind-unanswered"` after existing `"send"` case
   - Detect reply, skip if found, send notification if not

5. **`sendReminderNotification()`** in `workers/lib/notifications.ts`:
   - Accepts settings + email object
   - Formats message per template above
   - Dispatches to Telegram and/or Discord per settings (reuse existing dispatch helpers)

6. **Cancel endpoint** `DELETE /api/v1/mailboxes/:mailboxId/emails/:emailId/follow-up-reminder`:
   - Deletes matching `pending_alarms` row: `WHERE type='remind-unanswered' AND json_extract(payload,'$.emailId')=?`

7. **Register `getPendingFollowUps` agent tool** in `workers/index.ts` tools array:
   - Input: `{ days?: number }` (defaults to mailbox `unansweredDays` setting)
   - Returns serialized `Email[]` with subject/sender/date

8. **Settings UI** in `app/routes/settings.tsx`:
   - Add numeric input for "Remind after N days with no reply" under notification settings
   - Saves to mailbox settings R2 blob via existing settings PATCH API

## Todo List

- [ ] Add `#threadHasReplyAfter()` private DO method
- [ ] Add `getPendingFollowUps()` public DO method
- [ ] Extend `sendEmail()` to enqueue `remind-unanswered` alarm
- [ ] Add `remind-unanswered` branch to `alarm()` handler
- [ ] Add `sendReminderNotification()` to notifications helper
- [ ] Add cancel follow-up reminder API endpoint
- [ ] Register `getPendingFollowUps` agent tool
- [ ] Add `unansweredDays` field to settings UI
- [ ] Verify build compiles

## Success Criteria

- Sending an email enqueues a `pending_alarms` row of type `remind-unanswered`
- When alarm fires and no reply: Telegram message received within 5s
- When alarm fires and reply exists: no notification sent
- Cancel endpoint removes the alarm row
- Agent returns correct follow-up list when queried

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| User sends high volume → many alarms queued | `pending_alarms` table grows large | Table already has `fire_at` index; prune on reply detection (delete alarm when reply arrives) |
| Thread reply detection misidentifies own sent replies | Spurious "no reply" notifications | Filter `folder_id = 'inbox'` strictly — sent emails have `folder_id = 'sent'`, so own outbox won't match |
| Settings R2 read adds latency to `sendEmail()` | Slow send | Cache settings in DO in-memory map (TTL 5 min) — already done for other settings reads |

## Security Considerations

- Cancel endpoint must validate the email belongs to the authenticated mailbox (same as other email endpoints)
- `getPendingFollowUps` agent tool exposes email subjects to kimi-k2.5 — acceptable for personal assistant model
