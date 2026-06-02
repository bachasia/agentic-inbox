---
title: "Phase 2: Email Client Enrichment"
description: "Labels/tags, snooze, scheduled send, templates, contact book, and quick actions for daily-driver readiness"
status: complete
priority: P1
branch: "main"
tags: [labels, snooze, scheduled-send, templates, contacts, keyboard-shortcuts]
blockedBy: [260602-2006-phase1-foundation-notifications]
blocks: []
created: "2026-06-02T13:51:27.127Z"
createdBy: "ck:plan"
source: skill
---

# Phase 2: Email Client Enrichment

## Overview

Second phase of the Agentic Inbox roadmap. Builds on the completed Phase 1 (notifications, signature, unread badge) to add core email-client features that make daily use productive: labels for organization, snooze/scheduled-send via DO alarms, reusable templates, a contact book with autocomplete, and keyboard/swipe quick actions.

**Context:** [Brainstorm Report](../reports/brainstorm-260602-2006-full-roadmap-report.md)  
**Blocked by:** Phase 1 (complete — all code in place, uncommitted)

## Phases

| Phase | Name | Status | Effort | Priority |
|-------|------|--------|--------|----------|
| 1 | [DB Migrations & Schema](./phase-01-db-migrations-schema.md) | Pending | 1.5h | P1 |
| 2 | [Labels Full Stack](./phase-02-labels-full-stack.md) | Pending | 4h | P1 |
| 3 | [Snooze & Scheduled Send](./phase-03-snooze-scheduled-send.md) | Pending | 5h | P1 |
| 4 | [Templates & Contact Book](./phase-04-templates-contact-book.md) | Pending | 5h | P2 |
| 5 | [Quick Actions](./phase-05-quick-actions.md) | Pending | 2h | P2 |

**Total effort:** ~17.5 hours

## Architecture

```
MailboxDO (DO SQLite)
  ├── labels            (id, name, color)
  ├── email_labels      (email_id ↔ label_id, many-to-many)
  ├── contacts          (id, email, name, frequency, last_seen)
  ├── pending_alarms    (id, type, payload JSON, fire_at TEXT)
  └── emails            (+ snooze_until, scheduled_send_at columns)

R2 mailbox settings JSON
  └── templates[]       (id, name, subject, body)

alarm() handler (single DO alarm → queue pattern)
  ├── snooze:    move email inbox when fire_at reached
  └── send:      fire sendEmail(), move draft → sent

Frontend
  ├── Label picker + sidebar filter + email list badges
  ├── Snooze picker (DateTimePicker in email toolbar)
  ├── ComposePanel: scheduled-send datetime + template dropdown
  ├── Contact autocomplete in To/Cc/Bcc inputs
  └── Keyboard shortcuts hook + swipe gestures + help modal (?)
```

## Key Decisions

1. **DO Alarm queue** — Only 1 alarm per DO. Use `pending_alarms` table; `alarm()` processes earliest, re-arms for next.
2. **Labels in DO SQLite** — Natural fit alongside emails; migration 9.
3. **Contacts in DO SQLite** — migration 11; auto-extracted on receive AND send (upsert by email address).
4. **Templates in R2 JSON** — Low-volume, no query needs; simpler than DO table.
5. **Snooze = virtual folder** — No new folder row; query filter `WHERE snooze_until IS NOT NULL AND snooze_until > now()`.
6. **Snoozed emails excluded from inbox** — Add `snooze_until IS NULL` condition to inbox queries.

## Dependencies

- No new external services (all Cloudflare-native)
- Phase 1 must be committed before this plan starts
