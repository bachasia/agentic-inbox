# Phase 3.4: Priority Inbox & UI Indicators

**Priority:** Medium
**Status:** Pending
**Depends on:** Phase 3.2 (auto-categorize populates triage data)

## Context Links

- [Email list UI](../../app/routes/email-list.tsx)
- [Sidebar](../../app/components/Sidebar.tsx)
- [Email types](../../app/types/index.ts)
- [API email list endpoint](../../workers/index.ts#L146-L168)
- [DO getThreadedEmails](../../workers/durableObject/index.ts)

## Overview

Add visual triage indicators to the email list (priority color band, category chip) and a new "Priority" virtual folder that shows high-priority unread emails first. Add triage filters to sidebar.

## Key Insights

- Email list already renders label badges, snooze status, draft badges — adding triage indicators follows the same pattern
- Threaded email queries already support `label_id` filter — extend with `priority` and `category` query params
- Sidebar already shows folders + label filter — add a "Priority Inbox" entry above folder list
- Triage data comes from email columns, no extra joins needed (unlike labels)

## Requirements

### Functional
- Priority color band on left edge of email row (4=red, 3=orange, 2=none, 1=none)
- Category chip next to date (small pill: "Business", "Newsletter", etc.)
- "Priority Inbox" sidebar entry — virtual folder showing: priority >= 3 unread first, then priority 2 unread, then recent
- Sidebar filter by category (dropdown or chip toggles)
- Triage data included in email list API responses (already in columns)

### Non-functional
- No extra API calls — triage fields returned with existing email list queries
- Priority inbox query uses existing index `idx_emails_triage_priority`
- Visual indicators must not clutter the compact email list — subtle and informative

## Architecture

```
Priority Inbox (virtual folder):
  SELECT * FROM emails
  WHERE folder_id = 'inbox'
  ORDER BY
    CASE WHEN read = 0 THEN 0 ELSE 1 END,
    triage_priority DESC NULLS LAST,
    date DESC
  LIMIT ?

Sidebar:
  ┌─────────────────────┐
  │ ★ Priority Inbox    │  ← NEW virtual folder
  │ Inbox          (12) │
  │ Sent               │
  │ Drafts          (2) │
  │ Archive             │
  │ Spam                │
  │ Trash               │
  │ ─── Labels ──────── │
  │ ● Business          │
  │ ● Newsletter        │
  └─────────────────────┘
```

## Related Code Files

### Modify
- `workers/durableObject/index.ts` — add `getPriorityInboxEmails()` method
- `workers/index.ts` — add priority inbox API route
- `app/routes/email-list.tsx` — render priority band + category chip
- `app/components/Sidebar.tsx` — add Priority Inbox entry
- `app/routes.ts` — add priority inbox route (or reuse email-list with query param)
- `app/services/api.ts` — add priority inbox fetch function

### No new files needed

## Implementation Steps

1. **DO method: `getPriorityInboxEmails()`** in `workers/durableObject/index.ts`:
   - Query inbox emails sorted by: unread first, then priority DESC, then date DESC
   - Reuse existing threaded email query structure, just change ORDER BY
   - Params: `page`, `limit` (default 50)

2. **API route** in `workers/index.ts`:
   ```
   GET /api/v1/mailboxes/:mailboxId/priority-inbox?page=1&limit=50
   ```
   - Calls `getPriorityInboxEmails()` on DO stub
   - Returns same shape as email list (`{ emails, totalCount }`)

3. **Sidebar entry** in `app/components/Sidebar.tsx`:
   - Add "Priority Inbox" above the folder list with a star/fire icon
   - Links to `/mailbox/:id/priority` route
   - Show count of unread priority >= 3 emails (optional — can skip for v1)

4. **Route** in `app/routes.ts`:
   - Add route for priority inbox, reusing email-list component with `?view=priority` or a dedicated route

5. **API service** in `app/services/api.ts`:
   - Add `fetchPriorityInbox(mailboxId, page, limit)` function

6. **Email list UI indicators** in `app/routes/email-list.tsx`:
   - **Priority band**: 3px left border on each email row
     - Priority 4 (urgent): `border-l-red-500`
     - Priority 3 (high): `border-l-orange-400`
     - Priority 2 (normal): no border (default)
     - Priority 1 (low): no border
   - **Category chip**: Small muted pill after the date, using category color from system label
     - Only show for non-null `triage_category`
     - Text: capitalize first letter of category
   - **Thread summary**: If `triage_summary` exists and `thread_count >= 3`, show below snippet in italic muted text

7. **Include triage fields in existing queries**: Ensure `getThreadedEmails()` and `getEmails()` SELECT includes `triage_category`, `triage_priority`, `triage_summary`, `triage_confidence`. (Drizzle schema update in 3.1 should handle this automatically.)

## Todo List

- [ ] Add `getPriorityInboxEmails()` DO method
- [ ] Add priority inbox API endpoint
- [ ] Add Priority Inbox sidebar entry
- [ ] Add priority inbox route
- [ ] Add API service function for priority inbox
- [ ] Render priority color band on email rows
- [ ] Render category chip on email rows
- [ ] Render thread summary below snippet
- [ ] Ensure triage fields included in email list queries
- [ ] Visual test: check email list readability with indicators

## Success Criteria

- Priority Inbox shows high-priority unread emails first
- Email rows show colored left border for priority 3+
- Category chips visible on triaged emails
- Thread summaries shown for threads 3+ messages
- No visual regression on emails without triage data (null fields)

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Priority inbox query slow on large mailboxes | Sluggish load | Index on triage_priority already created in migration 14 |
| Category chips clutter compact rows | UX degradation | Keep chips small (text-xs), muted colors, hide on mobile |
| Untriaged emails look broken in priority view | Confusion | NULLS LAST in sort — untriaged emails appear at bottom |
