# Phase 3.2: Auto-Categorize & Priority on Inbound

**Priority:** High
**Status:** Pending
**Depends on:** Phase 3.1 (schema + triage core)

## Context Links

- [receiveEmail pipeline](../../workers/index.ts#L563-L646)
- [triageEmail function](../../workers/lib/ai.ts) (added in 3.1)
- [DO methods](../../workers/durableObject/index.ts)
- [Labels API routes](../../workers/index.ts#L314-L348)
- [Notification helper](../../workers/lib/notifications.ts)

## Overview

Wire `triageEmail()` into the `receiveEmail()` pipeline so every inbound email gets auto-classified. Auto-apply system labels based on category. Auto-move spam above confidence threshold. Add manual triage override API endpoint.

## Key Insights

- `receiveEmail()` already uses `waitUntil()` for notifications and auto-draft — triage should run inline (before notification) so notification can include priority info
- System labels (e.g. "Newsletter", "Urgent") should auto-create on first use — no manual setup required
- Spam auto-move uses existing `moveEmail()` DO method — no new logic needed
- Auto-labeling uses existing `applyLabel()` — builds on Phase 2 labels

## Requirements

### Functional
- Every inbound email gets triaged via `triageEmail()` in the receive pipeline
- Triage result stored in email columns (category, priority, confidence, reason)
- System labels auto-created and applied based on category
- Emails with `category=spam` + confidence > 0.85 auto-move to Spam folder
- API endpoint for manual triage override: `PUT /api/v1/mailboxes/:id/emails/:id/triage`
- Triage settings per mailbox: enable/disable, spam threshold, categories to auto-label

### Non-functional
- Triage runs asynchronously via `waitUntil()` — does not block email receipt
- Pipeline order: create email → triage (waitUntil) → notify → auto-draft
- System labels use reserved prefix (e.g. `ai:newsletter`) to avoid name clashes with user labels

## Architecture

```
receiveEmail() updated pipeline:
  1. Parse + store email          ← existing (unchanged)
  2. Extract contact              ← existing (unchanged)
  3. ▶ Triage email               ← NEW (waitUntil)
     ├─ Call triageEmail(ai, {subject, body, sender})
     ├─ setEmailTriage(emailId, result)
     ├─ Auto-create + apply system label for category
     └─ If spam + confidence > 0.85: moveEmail → spam folder
  4. Send notification            ← existing (add priority to message)
  5. Auto-draft                   ← existing (skip if spam)
```

### System Labels (auto-created)

| Category     | Label Name   | Color   |
|-------------|-------------|---------|
| personal    | Personal    | #3b82f6 |
| business    | Business    | #8b5cf6 |
| newsletter  | Newsletter  | #06b6d4 |
| notification| Notification| #f59e0b |
| spam        | Spam        | #ef4444 |

## Related Code Files

### Modify
- `workers/index.ts` — add triage step to `receiveEmail()`, add triage API endpoint
- `workers/durableObject/index.ts` — add `ensureSystemLabel()` method
- `workers/lib/notifications.ts` — optionally include priority in notification message

### No new files needed

## Implementation Steps

1. **DO method: `ensureSystemLabel()`** in `workers/durableObject/index.ts`:
   - Takes `(category: string)` → returns label id
   - Uses a static map: category → {name, color}
   - `INSERT OR IGNORE` into labels table with `ai-{category}` as id
   - Returns the label id for `applyLabel()`

2. **Wire triage into `receiveEmail()`** in `workers/index.ts` (after email creation, line ~620):
   ```ts
   ctx.waitUntil((async () => {
     const triage = await triageEmail(env.AI, {
       subject: parsedEmail.subject || "",
       body: parsedEmail.html || parsedEmail.text || "",
       sender: senderAddr,
     });
     if (!triage) return; // fail-open
     await stub.setEmailTriage(messageId, triage);
     const labelId = await stub.ensureSystemLabel(triage.category);
     if (labelId) await stub.applyLabel(messageId, labelId);
     if (triage.category === "spam" && triage.confidence > 0.85) {
       await stub.moveEmail(messageId, "spam");
     }
   })().catch(e => console.error("Triage failed:", e.message)));
   ```

3. **Skip auto-draft for spam**: In the auto-draft `waitUntil()` block, check if email was moved to spam — if so, skip agent trigger. (Or just let it fail gracefully — agent checks folder.)

4. **API endpoint** `PUT /api/v1/mailboxes/:mailboxId/emails/:id/triage`:
   - Body: `{ category?: string, priority?: number }`
   - Calls `setEmailTriage()` with user-supplied values + confidence=1.0
   - Allows user to correct AI classification

5. **Enhance notification** (optional): Include priority emoji in Telegram/Discord message for high-priority emails (priority >= 3).

## Todo List

- [ ] Add `ensureSystemLabel()` DO method
- [ ] Wire `triageEmail()` into `receiveEmail()` pipeline
- [ ] Skip auto-draft for spam-classified emails
- [ ] Add `PUT /emails/:id/triage` API endpoint for manual override
- [ ] Enhance notifications with priority indicator
- [ ] Test: receive email → verify triage columns populated
- [ ] Test: spam email auto-moved to Spam folder

## Success Criteria

- Inbound emails get `triage_category` and `triage_priority` filled automatically
- System labels appear in label list after first triage run
- Spam emails with high confidence auto-move to Spam folder
- Manual triage override works via API
- No regression: existing receive pipeline still works if triage fails

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| AI rate limits on Workers AI | Triage silently skipped | fail-open design, triage is optional |
| System labels clutter user's label list | UX annoyance | Prefix with `ai-` id, let user delete if unwanted |
| Spam false positives | User misses important email | High threshold (0.85), email stays in DB (just moved to spam) |

## Security Considerations

- Manual triage endpoint must be behind the same auth as other email operations (Cloudflare Access JWT)
- No external API calls — Workers AI is CF-native
