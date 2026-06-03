---
phase: 2
title: "Frontend enriched cards"
status: pending
priority: P2
effort: "1.5h"
dependencies: [1]
---

# Phase 2: Frontend Enriched Cards

## Overview

Extend Mailbox type, update API client, and redesign home page mailbox cards to display unread badges, latest email preview, activity timestamps, and status indicators.

## Requirements

- Functional: Show unread count badge, latest email sender+subject, relative time, forwarding/autoReply status
- Non-functional: Cards render immediately with available data; no layout shift

## Related Code Files

- Modify: `app/types/index.ts` — extend `Mailbox` interface with `summary` + `status` fields
- Modify: `shared/dates.ts` — add `formatRelativeDate()` function
- Modify: `app/routes/home.tsx` — redesign mailbox cards

## Architecture

```
API response (enriched) → useMailboxes() → home.tsx
  account.summary.inboxUnreadCount → Badge
  account.summary.latestEmail → preview line
  account.status.forwardingEnabled → status pill
  account.status.autoReplyEnabled → status pill
```

## Implementation Steps

1. **Extend `Mailbox` interface** (`app/types/index.ts:106-111`):
   ```ts
   export interface MailboxSummary {
     inboxUnreadCount: number;
     latestEmail: {
       sender: string;
       subject: string;
       date: string;
     } | null;
   }

   export interface MailboxStatus {
     forwardingEnabled: boolean;
     autoReplyEnabled: boolean;
   }

   export interface Mailbox {
     id: string;
     email: string;
     name: string;
     settings?: MailboxSettings;
     summary?: MailboxSummary;
     status?: MailboxStatus;
   }
   ```

2. **Redesign mailbox card in home.tsx** — replace current `<RouterLink>` content:
   - Top row: avatar + name + unread badge (right-aligned)
   - Second row: email address
   - Third row (if latestEmail exists): sender name · subject truncated + relative time
   - Bottom row (optional): status pills for forwarding/autoReply when enabled
   - Use `parseMailboxSender()` to extract sender display name from `latestEmail.sender`
   - Use `formatRelativeDate()` from `shared/dates.ts` for `latestEmail.date`

3. **Helper: parse sender display name** — extract "John Doe" from `"John Doe <john@example.com>"`:
   ```ts
   function parseSenderName(sender: string): string {
     const match = sender.match(/^(.+?)\s*<.+>$/);
     return match ? match[1].trim() : sender.split("@")[0];
   }
   ```

4. **Add `formatRelativeDate()` to `shared/dates.ts`** — alongside existing `formatListDate`, `formatDetailDate`, etc.:
   ```ts
   export function formatRelativeDate(dateStr: string): string {
     const date = safeParse(dateStr);
     if (!date) return dateStr;
     const diff = Date.now() - date.getTime();
     const minutes = Math.floor(diff / 60000);
     if (minutes < 1) return "just now";
     if (minutes < 60) return `${minutes}m ago`;
     const hours = Math.floor(minutes / 60);
     if (hours < 24) return `${hours}h ago`;
     const days = Math.floor(hours / 24);
     return `${days}d ago`;
   }
   ```

5. **Status pills** — use `account.status` flags (not full settings):
   ```tsx
   {account.status?.forwardingEnabled && (
     <span className="text-xs text-kumo-subtle">⟳ Forwarding</span>
   )}
   {account.status?.autoReplyEnabled && (
     <span className="text-xs text-kumo-subtle">↩ Auto-reply</span>
   )}
   ```

## Success Criteria

- [ ] Mailbox type includes optional `summary` and `status` fields
- [ ] `useMailboxes()` has `staleTime: 30_000` to avoid re-fetching on every home navigation
- [ ] Unread badge shows on cards with unread count > 0
- [ ] Latest email preview shows sender name + subject + relative time
- [ ] Status pills show when forwarding/autoReply enabled
- [ ] Cards degrade gracefully when summary is undefined (backwards compatible)
- [ ] Typecheck passes

## Risk Assessment

- **Missing summary**: Backend might not return summary for newly created mailboxes. Use optional chaining throughout.
- **Long subjects**: Truncate with `truncate` CSS class (already used in codebase).
