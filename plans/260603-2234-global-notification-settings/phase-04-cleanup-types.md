---
phase: 4
title: Cleanup & Types
status: completed
priority: P3
effort: 30min
dependencies:
  - 3
---

# Phase 4: Cleanup & Types

## Overview

Verify `GlobalSettings` and `GlobalNotificationSettings` types (added in Phase 2) are correctly exported. Run end-to-end typecheck + build. No destructive type changes — existing `TelegramSettings` / `DiscordSettings` / `MailboxSettings` shapes are left as-is (still valid, just no longer written by the per-mailbox UI).

## Related Code Files

- Modify: `app/types/index.ts`

## Implementation Steps

### 1. Verify types in `app/types/index.ts`

Confirm Phase 2 added `GlobalStoreNotifConfig`, `GlobalNotificationSettings`, `GlobalSettings` after the `NotificationSettings` interface (~line 26). If any are missing, add them here (see Phase 2 Step 1 for the exact definitions).

### 2. Run typecheck

```bash
npm run typecheck
# or
npx tsc --noEmit
```

Fix any type errors before marking complete.

### 3. Run build

```bash
npm run build
```

Confirm clean build with no warnings about unused imports or missing types.

## Success Criteria

- [ ] `GlobalStoreNotifConfig`, `GlobalNotificationSettings`, `GlobalSettings` exported from `app/types/index.ts`
- [ ] `npm run typecheck` exits 0
- [ ] `npm run build` exits 0
- [ ] No unused import warnings in modified files

## Risk Assessment

- Minimal risk — additive only, no existing types modified.
- If `TelegramSettings` / `DiscordSettings` still appear in type errors (e.g. something expects the old shape with credentials), do NOT remove those fields yet — add a note for future cleanup when all consumers are confirmed removed.
