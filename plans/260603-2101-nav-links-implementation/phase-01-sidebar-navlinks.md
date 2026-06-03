---
phase: 1
title: Sidebar NavLinks
status: completed
priority: P2
effort: 30m
dependencies: []
---

# Phase 1: Sidebar NavLinks

## Overview

Replace 4 decorative `<button>` elements in `home-sidebar.tsx` with `<NavLink>` from `react-router`. Active state becomes URL-driven — no hardcoded `bg-kumo-fill` class.

## Related Code Files

- Modify: `app/components/home/home-sidebar.tsx`

## Architecture

NavLink's `className` callback receives `{ isActive }`. Active item gets `bg-kumo-fill text-kumo-default font-medium`; inactive gets `text-kumo-strong hover:bg-kumo-fill`. The `/` Mailboxes link needs `end` prop to prevent matching every route.

## Implementation Steps

1. Import `NavLink` from `react-router` (already imported `Link as RouterLink` — add `NavLink` to the same import)
2. Extract active/inactive class logic into a helper:
   ```tsx
   const navCls = ({ isActive }: { isActive: boolean }) =>
     `w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
       isActive
         ? "bg-kumo-fill text-kumo-default font-medium"
         : "text-kumo-strong hover:bg-kumo-fill"
     }`;
   ```
3. Replace the 4 `<button>` elements in the `<nav>` section (lines 80–118) with:
   ```tsx
   <NavLink to="/all-inboxes" className={navCls}>
     <TrayIcon size={16} />
     All inboxes
     {totalUnread > 0 && <span className="ml-auto ...">{totalUnread}</span>}
   </NavLink>
   <NavLink to="/" end className={navCls}>
     <SquaresFourIcon size={16} />
     Mailboxes
   </NavLink>
   <NavLink to="/domains" className={navCls}>
     <GlobeIcon size={16} />
     Domains
     {domains.length > 0 && <span className="ml-auto ...">{domains.length}</span>}
   </NavLink>
   <NavLink to="/settings" className={navCls}>
     <GearSixIcon size={16} />
     Settings
   </NavLink>
   ```
4. Remove the hardcoded `bg-kumo-fill text-kumo-default font-medium` from the old Mailboxes button — NavLink handles this automatically

## Success Criteria

- [ ] All 4 nav items render as `<a>` tags pointing to correct routes
- [ ] Active item has `bg-kumo-fill font-medium` applied; inactive items do not
- [ ] Navigating between routes updates active state without page reload
- [ ] Mailboxes link is only active on exact `/` (not on `/all-inboxes`, `/domains`, etc.)
- [ ] TypeScript compiles with no errors

## Risk Assessment

Low — purely additive change. Routes `/all-inboxes`, `/domains`, `/settings` don't exist yet; clicking will show 404 until Phase 3. That's acceptable during development.
