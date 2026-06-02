---
title: "Phase 1: Foundation & Notifications"
description: "Add Telegram/Discord notifications, rich signature editor, and unread badge to make Agentic Inbox daily-driver ready"
status: completed
priority: P1
branch: "main"
tags: [notifications, telegram, discord, signature, ux]
blockedBy: []
blocks: []
created: "2026-06-02T13:15:06.274Z"
createdBy: "ck:plan"
source: skill
---

# Phase 1: Foundation & Notifications

## Overview

First phase of the Agentic Inbox roadmap. Goal: make the app daily-driver ready by adding inbound email notifications (Telegram/Discord), a rich signature editor, and unread count in the browser tab title. Currently users must actively check the web UI to know about new emails — this phase eliminates that gap.

**Context:** [Brainstorm Report](../reports/brainstorm-260602-2006-full-roadmap-report.md)

## Phases

| Phase | Name | Status | Effort | Priority |
|-------|------|--------|--------|----------|
| 1 | [Notification Backend Service](./phase-01-notification-backend-service.md) | Pending | 2h | P1 |
| 2 | [Notification Settings UI](./phase-02-notification-settings-ui.md) | Pending | 3h | P1 |
| 3 | [Inbound Email Notification Trigger](./phase-03-inbound-email-notification-trigger.md) | Pending | 1h | P1 |
| 4 | [Signature Editor UI](./phase-04-signature-editor-ui.md) | Pending | 3h | P2 |
| 5 | [Unread Badge in Browser Tab](./phase-05-unread-badge-in-browser-tab.md) | Pending | 1h | P2 |

**Total effort:** ~10 hours

## Architecture

```
Inbound Email → receiveEmail() → store in DO → fire notification
                                                    ↓
                                         Read mailbox settings (R2)
                                                    ↓
                                    ┌───────────────┴───────────────┐
                                    │                               │
                              Telegram Bot API              Discord Webhook
                              POST /sendMessage             POST webhook URL
```

## Key Decisions

1. **Notification config in R2 mailbox settings** — extends existing `MailboxSettings` JSON; no new storage layer needed
2. **Fire notifications via `waitUntil()`** — non-blocking, doesn't delay email storage
3. **Signature types already in `MailboxSettings`** — `SignatureSettings` interface exists with `enabled`, `text`, `html` fields; just need UI
4. **Unread count from existing folder query** — `getFolders()` already returns `unreadCount` per folder; reuse for inbox badge

## Dependencies

- No cross-plan dependencies (first plan in the project)
- External: Telegram Bot API (user creates bot via @BotFather), Discord webhook (user creates in channel settings)
