---
title: Nav Links Implementation
description: >-
  Wire up 4 sidebar nav buttons as real NavLinks; add /all-inboxes, /domains,
  /settings routes with backend support
status: pending
priority: P2
branch: main
tags:
  - ui
  - nav
  - routing
blockedBy: []
blocks: []
created: '2026-06-03T14:07:24.455Z'
createdBy: 'ck:plan'
source: skill
---

# Nav Links Implementation

## Overview

The home sidebar has 4 nav buttons (All inboxes, Mailboxes, Domains, Settings) that are currently decorative `<button>` elements with no routing. This plan wires them up as real `<NavLink>` components and creates 3 new route pages. `/mailboxes` already exists at `/`; the other three require new routes and one new backend endpoint.

## Current State

- `home-sidebar.tsx`: 4 `<button>` elements, no onClick, no routing
- Routes: `/` = Mailboxes, `/profile` = account, `/mailbox/:id/settings` = per-mailbox settings
- No `/all-inboxes`, `/domains`, or global `/settings` routes
- `GET /api/v1/mailboxes` fetches per-mailbox with summary; no unified emails endpoint
- `configData.domains` already available via `queryKeys.config`

## Target State

- Sidebar uses `<NavLink>` with URL-driven active state
- `/all-inboxes` → unified email list across all user mailboxes
- `/domains` → domain list with mailbox counts
- `/settings` → global: Theme toggle + link to /profile

## Phases

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| 1 | [Sidebar NavLinks](./phase-01-sidebar-navlinks.md) | Pending | Completed |
| 2 | [Backend all-emails endpoint](./phase-02-backend-all-emails-endpoint.md) | Pending | Completed |
| 3 | [Frontend routes and pages](./phase-03-frontend-routes-and-pages.md) | Pending | Completed |

## Dependencies

None — this plan is self-contained.
