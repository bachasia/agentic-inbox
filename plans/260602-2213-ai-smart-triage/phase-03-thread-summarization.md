# Phase 3.3: Thread Summarization

**Priority:** Medium
**Status:** Pending
**Depends on:** Phase 3.1 (triage_summary column)

## Context Links

- [DO getThreadEmails](../../workers/durableObject/index.ts)
- [AI utilities](../../workers/lib/ai.ts)
- [Email list UI](../../app/routes/email-list.tsx)
- [Agent handleNewEmail](../../workers/agent/index.ts#L329)

## Overview

Generate a one-line summary for threads with 3+ messages. Show in email list and agent panel. Summary generated on thread growth, cached in `triage_summary` on the latest email in the thread.

## Key Insights

- Thread emails already fetchable via `getThreadEmails(threadId)` DO method
- `triage_summary` column added in phase 3.1 — reuse for thread summary (stored on newest email in thread)
- Summary should regenerate when a new email arrives in an existing thread (not on every page load)
- Thread count already computed in threaded email list queries — use `thread_count >= 3` as trigger

## Requirements

### Functional
- Generate summary for threads with 3+ emails
- Summary is one line, max 120 chars
- Stored in `triage_summary` of the latest email in the thread
- Regenerated when new email arrives in a thread that already has 3+ messages
- Displayed in email list row (below subject/snippet)

### Non-functional
- Summary generation uses llama-4-scout (same model as triage — fast)
- Async via `waitUntil()` — does not block email receipt
- Only generates for threads that cross the 3-message threshold or grow beyond it

## Architecture

```
On new email arrival (receiveEmail → after triage):
  ├─ Count thread emails
  ├─ If count >= 3:
  │   ├─ Fetch all thread emails (subject + body, truncated)
  │   ├─ Call summarizeThread(ai, threadEmails)
  │   └─ Update triage_summary on the newest email
  └─ Else: skip
```

## Related Code Files

### Modify
- `workers/lib/ai.ts` — add `summarizeThread()` function
- `workers/index.ts` — add summary step to `receiveEmail()` pipeline
- `workers/durableObject/index.ts` — add `countThreadEmails()`, `setThreadSummary()` methods
- `app/routes/email-list.tsx` — render triage_summary in email row

### No new files needed

## Implementation Steps

1. **`summarizeThread()` function** in `workers/lib/ai.ts`:
   - Input: `ai: Ai`, `emails: Array<{sender, subject, body, date}>`
   - Build prompt with each email's sender + first 200 chars of body
   - System prompt: "Summarize this email thread in one sentence (max 120 chars). Focus on the topic and current status. Return ONLY the summary, no quotes."
   - Use `@cf/meta/llama-4-scout-17b-16e-instruct`, `max_tokens: 60`, `temperature: 0`
   - Return trimmed string or null on failure

2. **DO methods** in `workers/durableObject/index.ts`:
   - `countThreadEmails(threadId)` — `SELECT COUNT(*) FROM emails WHERE thread_id = ?`
   - `setThreadSummary(emailId, summary)` — `UPDATE emails SET triage_summary = ? WHERE id = ?`

3. **Wire into `receiveEmail()`** in `workers/index.ts`:
   - Inside the triage `waitUntil()` block (after triage + label):
   ```ts
   const threadCount = await stub.countThreadEmails(threadId);
   if (threadCount >= 3) {
     const threadEmails = await stub.getThreadEmails(threadId);
     const summary = await summarizeThread(env.AI, threadEmails);
     if (summary) await stub.setThreadSummary(messageId, summary);
   }
   ```

4. **Email list UI** in `app/routes/email-list.tsx`:
   - Below the snippet, if `email.triage_summary` exists, show it in a muted italic style
   - Only render in threaded view when `thread_count >= 3`

## Todo List

- [ ] Implement `summarizeThread()` in workers/lib/ai.ts
- [ ] Add `countThreadEmails()` and `setThreadSummary()` DO methods
- [ ] Wire summary generation into receiveEmail pipeline
- [ ] Render thread summary in email list UI
- [ ] Test: 3-message thread gets summary; 2-message thread does not

## Success Criteria

- Threads with 3+ messages show a summary in the email list
- Summary updates when new email arrives in an existing thread
- Summary is concise (1 line, max 120 chars)
- No performance impact on threads with < 3 messages

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Summary quality poor for complex threads | Misleading summary shown | Keep it optional/supplementary, user sees full thread on click |
| Token limits for long threads | AI truncation errors | Truncate each email body to 200 chars, max 10 emails in prompt |
