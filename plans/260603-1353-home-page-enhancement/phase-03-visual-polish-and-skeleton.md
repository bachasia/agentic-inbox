---
phase: 3
title: "Visual polish and skeleton"
status: pending
priority: P2
effort: "1h"
dependencies: [2]
---

# Phase 3: Visual Polish and Skeleton

## Overview

Add color-coded avatars, skeleton loading states, and smooth hover/transition effects to home page mailbox cards.

## Requirements

- Functional: Deterministic avatar colors from email, skeleton placeholders while loading, smooth hover
- Non-functional: No layout shift between skeleton and loaded state; colors visually distinct

## Related Code Files

- Modify: `app/routes/home.tsx` — avatar colors, skeleton, hover effects

## Implementation Steps

1. **Deterministic avatar color** — generate HSL color from email string hash:
   ```ts
   function getAvatarColor(email: string): string {
     let hash = 0;
     for (let i = 0; i < email.length; i++) {
       hash = email.charCodeAt(i) + ((hash << 5) - hash);
     }
     const hue = Math.abs(hash) % 360;
     return `hsl(${hue}, 55%, 45%)`;
   }
   ```
   Apply as `style={{ backgroundColor: getAvatarColor(account.email) }}` on avatar div, with white text.

2. **Skeleton loading** — show placeholder cards while `useMailboxes()` is loading:
   ```tsx
   function MailboxCardSkeleton() {
     return (
       <div className="flex items-center gap-4 px-5 py-4 animate-pulse">
         <div className="h-10 w-10 rounded-full bg-kumo-fill" />
         <div className="flex-1 space-y-2">
           <div className="h-4 w-32 rounded bg-kumo-fill" />
           <div className="h-3 w-48 rounded bg-kumo-fill" />
         </div>
       </div>
     );
   }
   ```
   Render 3 skeleton cards inside the same `rounded-xl border` container when `isLoading`.

3. **Hover effects** — update card `className`:
   ```
   transition-all duration-150 hover:bg-kumo-tint hover:shadow-sm
   ```

4. **Unread badge styling** — bold name + slightly different background when unread > 0:
   ```tsx
   const hasUnread = (account.summary?.inboxUnreadCount ?? 0) > 0;
   // Name text: add font-semibold when hasUnread
   // Subtle left border accent: border-l-2 border-kumo-accent when hasUnread
   ```

## Success Criteria

- [ ] Each mailbox has a unique, deterministic avatar color
- [ ] Skeleton cards show during initial load with pulse animation
- [ ] Smooth hover transition on cards
- [ ] Unread mailboxes have visual emphasis (bold name, accent border)
- [ ] No layout shift between skeleton → loaded state
- [ ] Typecheck passes

## Risk Assessment

- **Color contrast**: HSL(hue, 55%, 45%) ensures sufficient contrast with white text across all hues.
- **Dark mode**: `bg-kumo-fill` skeleton colors adapt via kumo theme tokens — no manual dark mode handling needed.
