# Phase 4: Proactive AI Assistant

**Status:** Planning
**Priority:** High
**Depends on:** Phase 3 (AI Smart Triage — labels, triage columns, notifications infra)
**Estimated effort:** 4 sub-phases (~2 weeks)

## Goal

Make the inbox an active assistant, not a passive reader. Surfaces unanswered emails, extracts action items and deadlines automatically, suggests follow-ups, and delivers a morning digest — all via the existing Telegram/Discord notification and DO alarm infrastructure.

## Architecture Overview

```
receiveEmail() pipeline additions:
  ...existing triage + notify + auto-draft...
  8. ▶ Extract action items + deadlines (NEW, waitUntil)

DO Alarm types (new):
  "remind-unanswered"  — fires N days after sent email with no reply
  "daily-digest"       — fires at configured time each morning (re-arms)

Agent tools (new):
  getActionItems()     — list pending action items
  getPendingFollowUps() — list unanswered sent emails > threshold
```

**AI model choice:** `@cf/meta/llama-4-scout-17b-16e-instruct` for action item extraction (fast, structured output). kimi-k2.5 for daily digest synthesis.

**Storage:** New `action_items` table in DO SQLite (migration 15). Unanswered-reply tracking uses existing sent emails + thread structure.

## Phases

| Phase | Title | Status | Description |
|-------|-------|--------|-------------|
| 4.1 | [Schema & foundation](phase-01-schema-and-action-items.md) | Pending | Migration 15, action_items table, DO methods, types |
| 4.2 | [Action item extraction & deadlines](phase-02-action-item-extraction-and-deadlines.md) | Pending | AI extraction on inbound, store structured items, UI |
| 4.3 | [Unanswered reminders & follow-ups](phase-03-unanswered-reminders-and-follow-ups.md) | Pending | DO alarms per sent email, Telegram notify, agent tool |
| 4.4 | [Daily digest](phase-04-daily-digest.md) | Pending | Morning summary alarm, aggregate overnight activity, Telegram |

## Key Decisions

- **No new notification infra.** Reuse Phase 1's Telegram/Discord helpers for all Phase 4 alerts.
- **Alarm queue pattern already exists.** `pending_alarms` table + `alarm()` handler is live (migration 12). Phase 4 just adds new types.
- **Unanswered detection is query-based.** Check if thread has any reply from the user's own address after the sent email — no separate tracking table needed.
- **Action items are extracted per-email on inbound.** Not retroactively on old emails (scope creep risk).
- **Daily digest uses re-arming alarm.** Alarm fires, sends digest, re-arms for next day. No cron trigger needed.
- **Fail-open everywhere.** Extraction or digest failure leaves inbox functional — no mail lost.

## Success Criteria

- Inbound emails produce `action_items` rows when actionable content detected
- Sent emails with no reply after configured threshold trigger Telegram reminder
- Morning digest arrives on Telegram with overnight summary + pending action items
- Agent can answer "what do I need to do?" by querying action items
- Zero regression on existing email receive/send pipeline
