---
phase: 4
title: "Testing and typecheck"
status: pending
priority: P2
effort: "30m"
dependencies: [3]
---

# Phase 4: Testing and Typecheck

## Overview

Run full typecheck, verify existing tests still pass, and add unit test for the new `getMailboxSummary()` DO method.

## Related Code Files

- Modify: `tests/unit/email-helpers.test.ts` — add test for enriched mailbox response shape
- Read: `workers/durableObject/index.ts` — verify `getMailboxSummary()` SQL correctness

## Implementation Steps

1. **Run typecheck**: `npx tsc --noEmit` — fix any type errors from new `MailboxSummary` interface
2. **Run existing tests**: `npm test` — ensure no regressions
3. **Add unit test** for `getMailboxSummary()` response shape validation (if test infrastructure supports DO testing)
4. **Manual verify**: Start dev server, confirm home page renders enriched cards correctly

## Success Criteria

- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npm test` passes with no regressions
- [ ] Home page renders correctly with enriched data in dev server
