---
title: Global Notification Settings Refactor
description: >-
  Move notification credentials (Bot Token, Chat ID, Webhook URL) to a
  system-wide Global Settings page. Per-store config (toggle + Topic ID) also
  lives in Global Settings. Per-mailbox settings page loses its Notifications
  section entirely.
status: pending
priority: P2
branch: main
tags:
  - notifications
  - settings
  - backend
  - frontend
blockedBy: []
blocks: []
created: '2026-06-03T15:34:57.774Z'
createdBy: 'ck:plan'
source: skill
---

# Global Notification Settings Refactor

## Overview

Currently notification credentials (Telegram Bot Token/Chat ID, Discord Webhook URL) and per-mailbox toggles are stored per-mailbox in `mailboxes/{id}.json` (R2). Target: credentials configured once globally, per-store toggle + Topic ID managed from Global Settings page.

**Target architecture:**
- **Global** (`global-settings.json` in R2): Telegram botToken + chatId, Discord webhookUrl, plus per-store `{ enabled, topicId }` map
- **Per-mailbox** (`mailboxes/{id}.json`): notification data no longer written by UI
- **UI**: All notification config in Global Settings page only

## Data Model

```
global-settings.json (R2)
{
  "notifications": {
    "telegram": {
      "botToken": "...",
      "chatId": "...",
      "stores": {
        "store@bach.asia":   { "enabled": true,  "topicId": "123" },
        "store2@domain.com": { "enabled": false, "topicId": "" }
      }
    },
    "discord": {
      "webhookUrl": "...",
      "stores": {
        "store@bach.asia":   { "enabled": true },
        "store2@domain.com": { "enabled": false }
      }
    }
  }
}
```

## Phases

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| 1 | [Backend: Global Settings API](./phase-01-backend-global-settings-api.md) | Pending | Completed |
| 2 | [Frontend: Global Settings UI](./phase-02-frontend-global-settings-ui.md) | Pending | Completed |
| 3 | [Frontend: Simplify Per-mailbox Settings](./phase-03-frontend-simplify-per-mailbox-settings.md) | Pending | Completed |
| 4 | [Cleanup & Types](./phase-04-cleanup-types.md) | Pending | Completed |

## Key Files Modified

| File | Change |
|------|--------|
| `workers/index.ts` | Add GET/PUT /api/v1/settings + POST /api/v1/settings/test-notification |
| `workers/lib/notifications.ts` | Add `getEffectiveNotifications()` helper |
| `workers/durableObject/index.ts` | Update 3 notification call sites |
| `app/types/index.ts` | Add `GlobalSettings`, `GlobalNotificationSettings` |
| `app/services/api.ts` | Add global settings API calls |
| `app/queries/keys.ts` | Add `globalSettings` query key |
| `app/queries/global-settings-query.ts` | New: TanStack Query hooks |
| `app/components/notifications-global-section.tsx` | New: Notifications UI component (admin-only) |
| `app/routes/global-settings.tsx` | Conditionally render NotificationsGlobalSection (admin only) |
| `app/routes/settings.tsx` | Remove Notifications section |

## Migration Note

No auto-migration. After deploy, admin re-enters credentials once in Global Settings. Old credentials in per-mailbox JSON are silently ignored (not deleted).
