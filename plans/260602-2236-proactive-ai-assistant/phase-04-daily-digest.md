# Phase 4.4: Daily Digest

**Priority:** Medium
**Status:** Pending
**Depends on:** Phase 4.1 (action_items), Phase 4.3 (unanswered follow-ups), Phase 1 (Telegram/Discord)

## Context Links

- [alarm() handler](../../workers/durableObject/index.ts#L948-L968)
- [pending_alarms enqueue](../../workers/durableObject/index.ts#L922-L934)
- [Notifications helper](../../workers/lib/notifications.ts)
- [Settings route](../../app/routes/settings.tsx)
- [AI utilities](../../workers/lib/ai.ts)

## Overview

Once per day at a user-configured time, aggregate overnight email activity — new unread emails, pending action items, and unanswered follow-ups — synthesize a brief summary with kimi-k2.5, and dispatch it via Telegram/Discord. The alarm re-arms itself for the next day on each firing.

## Key Insights

- Re-arming pattern: at end of `alarm()` `"daily-digest"` branch, call `this.#enqueueAlarm("daily-digest", {}, nextFireAt)` — `nextFireAt` = today's `digestTime` + 24h
- First alarm is seeded when the user saves `digestTime` in settings (not on every DO init) — avoids spurious digests on new DOs
- kimi-k2.5 used for synthesis only (prose summary) — the data aggregation is pure SQL, cheap and fast
- Digest content is intentionally concise: 3-5 bullets max per section — not a full inbox dump
- If notification channels not configured → skip dispatch, digest still computed (could show in agent panel later)

## Requirements

### Functional
- `compileDailyDigest()` method in DO: aggregate new emails since last digest, pending action items, unanswered follow-ups
- `synthesizeDigest()` AI function in `workers/lib/ai.ts` — given raw digest data, return 2-3 sentence prose summary
- `sendDigestNotification()` in `workers/lib/notifications.ts` — format + dispatch full digest message
- `alarm()` handler branch for `"daily-digest"`: compile → synthesize → dispatch → re-arm
- Settings: `digestTime` (HH:MM, default `"08:00"`), `digestEnabled` (boolean, default `false`)
- Settings UI: toggle + time picker for daily digest in notification settings section
- On settings save: if `digestEnabled` toggled on → seed initial `daily-digest` alarm; if toggled off → cancel pending alarm

### Non-functional
- Entire digest pipeline (SQL + AI) must complete in < 10s — acceptable for a background alarm
- Re-arm uses wall-clock time (ISO datetime), not relative offset, to avoid drift
- Skip dispatch gracefully if no notification channels configured (log only)

## Architecture

```
alarm() — "daily-digest" branch:
  1. const data = await this.#compileDailyDigest()
  2. const summary = await synthesizeDigest(env.AI, data)   // kimi-k2.5
  3. await sendDigestNotification(settings, data, summary)
  4. Re-arm: enqueue next "daily-digest" at tomorrow's digestTime

#compileDailyDigest() → DigestData:
  {
    newEmailsCount:   COUNT of emails received since last digest timestamp
    topEmails:        top 5 high-priority unread (priority >= 3)
    pendingActions:   listActionItems({ pendingOnly: true, limit: 5 })
    overdueActions:   action_items WHERE due_date < date('now') AND completed_at IS NULL
    followUps:        getPendingFollowUps(unansweredDays) LIMIT 3
    lastDigestAt:     stored in DO storage (ctx.storage.put/get)
  }

synthesizeDigest(ai, data) → string:
  Input: JSON summary of DigestData
  Prompt: "Write a 2-3 sentence morning briefing. Mention email count, any urgent items, and top action items."
  Model: kimi-k2.5 (prose quality matters here)
  Fallback: if AI fails, return empty string (send digest without prose summary)

Notification message format (Telegram):
  🌅 Morning Digest — {date}

  📬 {N} new emails  ({urgent} urgent)
  {top emails list: "• [Priority {p}] {subject} from {sender}"}

  ✅ Action items ({pending} pending{, N overdue}):
  {• description [due: date]}

  ⏰ Awaiting replies ({N}):
  {• {subject} → {recipient} ({N} days)}

  {prose summary if present}
```

### Re-arm calculation

```ts
function nextDigestFireAt(digestTime: string): string {
  // digestTime = "08:00"
  const [h, m] = digestTime.split(":").map(Number);
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(h, m, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1); // already past today's time
  return next.toISOString();
}
```

Note: timezone handling — `digestTime` is stored as UTC equivalent. Settings UI should document this or add a timezone offset field in Phase 5+.

## Related Code Files

### Modify
- `workers/durableObject/index.ts` — add `#compileDailyDigest()`, extend `alarm()` with `"daily-digest"` branch, add seed/cancel helpers
- `workers/lib/ai.ts` — add `synthesizeDigest()` function
- `workers/lib/notifications.ts` — add `sendDigestNotification()` function
- `workers/index.ts` — on settings PATCH, seed or cancel daily-digest alarm
- `app/routes/settings.tsx` — add digest toggle + time input to notification settings

### No new files needed

## Implementation Steps

1. **`#compileDailyDigest()`** private DO method:
   - Read `lastDigestAt` from `ctx.storage.get("lastDigestAt")` (ISO string or null)
   - Run 4 queries in parallel: new email count, top priority emails, pending action items, pending follow-ups
   - Return typed `DigestData` object
   - After dispatch, update `lastDigestAt` via `ctx.storage.put("lastDigestAt", new Date().toISOString())`

2. **`synthesizeDigest()`** in `workers/lib/ai.ts`:
   - Input: `ai: Ai`, `data: DigestData`
   - Build compact JSON summary of data as prompt context (< 500 tokens)
   - Call kimi-k2.5 with prose summary request
   - Return string; return `""` on failure

3. **`sendDigestNotification()`** in `workers/lib/notifications.ts`:
   - Build formatted message per template above
   - Dispatch via Telegram and/or Discord per settings (reuse existing helpers)
   - If no channels configured, log and return

4. **`alarm()` `"daily-digest"` branch** in `workers/durableObject/index.ts`:
   ```ts
   case "daily-digest": {
     const settings = await this.#getMailboxSettings();
     const data = await this.#compileDailyDigest();
     const summary = await synthesizeDigest(this.env.AI, data).catch(() => "");
     await sendDigestNotification(settings, data, summary);
     // re-arm
     const next = nextDigestFireAt(settings.digestTime ?? "08:00");
     await this.#enqueueAlarm("daily-digest", {}, next);
     break;
   }
   ```

5. **Seed/cancel on settings save** in `workers/index.ts` (settings PATCH handler):
   - If `digestEnabled` transitions to `true`: call `stub.seedDigestAlarm(digestTime)`
   - If `digestEnabled` transitions to `false`: cancel pending `daily-digest` alarm row
   - `seedDigestAlarm(digestTime)` DO method: cancel existing, enqueue new for `nextDigestFireAt(digestTime)`

6. **Settings UI** in `app/routes/settings.tsx`:
   - Toggle: "Daily digest" on/off
   - Time input: "Send at" HH:MM (visible only when enabled)
   - Save triggers settings PATCH which seeds/cancels the alarm

## Todo List

- [ ] Implement `#compileDailyDigest()` DO method (queries + ctx.storage for lastDigestAt)
- [ ] Implement `synthesizeDigest()` AI function
- [ ] Implement `sendDigestNotification()` notification helper
- [ ] Add `"daily-digest"` branch to `alarm()` handler with re-arm
- [ ] Add `seedDigestAlarm()` / cancel helpers to DO
- [ ] Wire seed/cancel into settings PATCH handler
- [ ] Add digest toggle + time picker to settings UI
- [ ] Verify build compiles

## Success Criteria

- Toggling digest on in settings creates a `pending_alarms` row
- When alarm fires: Telegram message received with correct counts
- Alarm row reappears for next day after firing
- Toggling digest off cancels the pending alarm row
- No notification sent when Telegram/Discord not configured (no crash)

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| kimi-k2.5 synthesis fails | Digest sent without prose summary | `synthesizeDigest()` returns `""` on error; digest still dispatched with raw data |
| Re-arm creates duplicate alarm rows | Double-digest tomorrow | Cancel existing `daily-digest` alarm before enqueueing new one in `seedDigestAlarm()` |
| digestTime interpreted as local vs UTC | Digest fires at wrong hour | Document clearly in settings UI: "Time is UTC". Add timezone support in Phase 5+ if needed |
| Very large mailboxes: compileDailyDigest slow | Alarm timeout | Cap all queries with LIMIT; count queries are O(index) not O(table) |

## Security Considerations

- Digest message sent to Telegram includes email subjects and sender names — confirm user is comfortable with this before enabling (settings UI note: "digest content is sent to your configured notification channels")
- `synthesizeDigest` receives top email subjects + action item descriptions — Workers AI only, no external calls
- `lastDigestAt` stored in DO durable storage, not SQLite — survives eviction
