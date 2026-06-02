---
phase: 5
title: "Unread Badge in Browser Tab"
status: pending
priority: P2
effort: "1h"
dependencies: []
---

# Phase 5: Unread Badge in Browser Tab

## Overview

Show the total unread inbox count in the browser tab title: `(3) Inbox - Agentic Inbox`. Uses the existing `getFolders()` API which already returns `unreadCount` per folder. No backend changes needed.

## Requirements

- Functional: Page title updates to `(N) Agentic Inbox` when N > 0 unread inbox emails
- Functional: Title reverts to `Agentic Inbox` when inbox is empty or on home page
- Functional: Count updates on email list refetch (existing 30s auto-refetch) and on read/star mutations
- Non-functional: No additional API calls — piggyback on existing folder query data

## Architecture

```
useFolders() → find inbox folder → unreadCount
                    ↓
           useEffect → document.title = count > 0 ? `(${count}) Agentic Inbox` : "Agentic Inbox"
```

## Related Code Files

- Modify: `app/routes/mailbox.tsx` — add `useEffect` to update `document.title` based on inbox unread count
- Read: `app/queries/folders.ts` — `useFolders()` returns `Folder[]` with `unreadCount`
- Read: `shared/folders.ts` — `Folders.INBOX` constant for finding inbox folder

## Implementation Steps

1. **Add title effect in `app/routes/mailbox.tsx`:**
   The mailbox layout route already renders the sidebar which calls `useFolders()`. Add a small hook or inline effect:
   ```ts
   import { useFolders } from "~/queries/folders";
   import { Folders } from "shared/folders";

   // Inside the component:
   const { data: folders } = useFolders(mailboxId);
   const inboxUnread = folders?.find(f => f.id === Folders.INBOX)?.unreadCount ?? 0;

   useEffect(() => {
     document.title = inboxUnread > 0
       ? `(${inboxUnread}) Agentic Inbox`
       : "Agentic Inbox";
     return () => { document.title = "Agentic Inbox"; };
   }, [inboxUnread]);
   ```

2. **Verify `useFolders` is already called** in the mailbox layout or sidebar. If it's only in Sidebar, either:
   - (a) Lift the query to `mailbox.tsx` and pass down, or
   - (b) Call `useFolders` independently in `mailbox.tsx` — TanStack Query deduplicates identical queries so no extra network request.

   Option (b) is simpler and correct — TanStack Query's `queryKey` dedup ensures a single fetch.

3. **Reset title on home page:** The `mailbox.tsx` cleanup function (return in useEffect) handles unmount. The root layout `<title>` tag in `root.tsx` already sets `Agentic Inbox` as default — SSR renders get the correct static title.

4. **Run dev server** and verify:
   - Tab shows `(N) Agentic Inbox` when unread emails exist
   - Count updates after marking email as read
   - Count updates on 30s auto-refetch when new email arrives
   - Navigating to home page resets title

## Success Criteria

- [ ] Browser tab shows `(3) Agentic Inbox` when 3 unread inbox emails
- [ ] Tab shows `Agentic Inbox` when 0 unread
- [ ] Count updates reactively when email is marked read
- [ ] Count updates on auto-refetch (30s interval)
- [ ] No extra API calls (piggybacks on existing folder query)
- [ ] Title resets when navigating away from mailbox
- [ ] `npm run typecheck` passes

## Risk Assessment

- **Multiple mailbox support:** If user has multiple mailboxes, the badge shows the current mailbox's unread count only. Showing aggregate across all mailboxes would require a new API call on the home page. Out of scope — per-mailbox is correct for now.
- **SSR hydration mismatch:** `document.title` is client-only via `useEffect`, so no SSR mismatch. The server-rendered `<title>` tag stays static.
