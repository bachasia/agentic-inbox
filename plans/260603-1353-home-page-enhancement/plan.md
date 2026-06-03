---
title: "Home Page UI Enhancement"
description: "Add unread badges, latest email preview, activity timestamps, status indicators, color-coded avatars, skeleton loading to home page"
status: done
priority: P2
branch: "main"
tags: [ui, home, mailbox]
blockedBy: []
blocks: []
created: "2026-06-03T07:02:35.639Z"
createdBy: "ck:plan"
source: skill
---

# Home Page UI Enhancement

## Overview

Enrich the home page mailbox list from basic name+email cards to information-dense cards showing unread counts, latest email preview, activity timestamps, mailbox status indicators, and color-coded avatars. Includes skeleton loading and smooth transitions.

## Current State

- `GET /api/v1/mailboxes` returns `{id, email}` from R2 listing only — no DO queries
- Home page shows simple cards: avatar initial, name, email
- Group-by-domain already implemented
- No unread counts, no latest email preview, no activity info on home page
- `getFolders()` in MailboxDO already returns per-folder unread counts

## Target State

```
┌─────────────────────────────────────────────────────┐
│  🟣  Hello                              3 unread    │
│      hello@bach.asia                                │
│      ─────────────────────────────────────────────  │
│      John Doe · Re: Project update       2 min ago  │
│      ⟳ Forwarding on                               │
└─────────────────────────────────────────────────────┘
```

## Phases

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| 1 | [Backend mailbox summary](./phase-01-backend-mailbox-summary.md) | Done | ~1h |
| 2 | [Frontend enriched cards](./phase-02-frontend-enriched-cards.md) | Done | ~1.5h |
| 3 | [Visual polish and skeleton](./phase-03-visual-polish-and-skeleton.md) | Done | ~1h |
| 4 | [Testing and typecheck](./phase-04-testing-and-typecheck.md) | Done | ~30m |

## Dependencies

None — standalone UI enhancement with no cross-plan dependencies.

## Validation Log

### Session 1 — 2026-06-03
**Trigger:** Pre-implementation validation
**Questions asked:** 3

#### Verification Results
- **Tier:** Standard (4 phases — Fact Checker + Contract Verifier)
- **Claims checked:** 8
- **Verified:** 7 | **Failed:** 1 | **Unverified:** 0

#### Failures
1. [Fact Checker] `~/lib/date` — path not found. Actual: `shared/dates.ts` (formatListDate, formatDetailDate, etc.)

#### Questions & Answers

1. **[Architecture]** Where should `formatRelativeDate` live?
   - Options: shared/dates.ts (Recommended) | Inline in home.tsx
   - **Answer:** shared/dates.ts — consistent with existing pattern
   - **Rationale:** All date formatting already centralized in shared/dates.ts

2. **[Performance]** Should we add stale-while-revalidate for enriched mailboxes endpoint?
   - Options: No caching | TanStack staleTime: 30s | Both
   - **Answer:** TanStack staleTime: 30s — frontend-only caching
   - **Rationale:** Avoids re-fetching on every home navigation while keeping implementation simple

3. **[Architecture]** Include full settings or just status flags in list response?
   - Options: Status flags only (Recommended) | Full settings
   - **Answer:** Status flags only — `{ forwardingEnabled, autoReplyEnabled }`
   - **Rationale:** Minimal response, no sensitive settings leaked

#### Confirmed Decisions
- `formatRelativeDate` → `shared/dates.ts` (consistent with existing utils)
- `useMailboxes()` staleTime: 30s (prevent unnecessary re-fetches)
- Response shape: status flags only, not full MailboxSettings

#### Action Items
- [x] Phase 1: Change response to return `status: { forwardingEnabled, autoReplyEnabled }` instead of full `settings`
- [x] Phase 2: Fix `~/lib/date` reference → `shared/dates.ts`, add `formatRelativeDate()`
- [x] Phase 2: Add `MailboxStatus` interface, update `Mailbox` type
- [x] Phase 2: Add `staleTime: 30_000` to `useMailboxes()`

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01, phase-02, phase-03, phase-04
- Decision deltas checked: 3 (date location, response shape, staleTime)
- Reconciled stale references: 2 (~/lib/date → shared/dates.ts, settings → status flags)
- Unresolved contradictions: 0
