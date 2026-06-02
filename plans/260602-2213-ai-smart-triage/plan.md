# Phase 3: AI Smart Triage

**Status:** Planning
**Priority:** High
**Depends on:** Phase 2 (labels, snooze, contacts — complete)
**Estimated effort:** 4 sub-phases

## Goal

Reduce manual inbox management by auto-classifying inbound emails with category + priority, summarizing long threads, detecting spam, and providing a priority inbox view.

## Architecture Overview

```
receiveEmail() pipeline (workers/index.ts):
  1. Parse email (PostalMime)        ← existing
  2. Store attachments (R2)          ← existing
  3. Create email in DO              ← existing
  4. Extract contact                 ← existing
  5. ▶ Triage email (NEW)            ← classify + score + auto-label
  6. Send notification               ← existing
  7. Auto-draft via agent            ← existing
```

**AI model choice:** `@cf/meta/llama-4-scout-17b-16e-instruct` for triage (fast, structured output). kimi-k2.5 reserved for agent chat & drafting.

**Storage:** New columns on `emails` table (priority, category) + auto-applied system labels via existing labels infrastructure.

## Phases

| Phase | Title | Status | Description |
|-------|-------|--------|-------------|
| 3.1 | [Schema & triage core](phase-01-schema-and-triage-core.md) | Pending | Migration 14, triageEmail() AI function, DO method, types |
| 3.2 | [Auto-categorize & priority](phase-02-auto-categorize-and-priority.md) | Pending | Hook into receiveEmail(), auto-label, API endpoint |
| 3.3 | [Thread summarization](phase-03-thread-summarization.md) | Pending | Summarize threads 3+ messages, cache in email metadata |
| 3.4 | [Priority inbox & UI](phase-04-priority-inbox-and-ui.md) | Pending | Priority inbox view, visual indicators in email list |

## Key Decisions

- **No separate spam phase.** Smart spam detection folds into phase 3.2 auto-categorize — spam is just another category with an auto-move action above a confidence threshold.
- **System labels.** Auto-create triage labels (Urgent, Business, Newsletter, etc.) on first triage run. Users can delete/customize them like regular labels.
- **Fail-open triage.** If AI call fails, email arrives normally without triage — user never loses mail.
- **Single AI call per email.** One structured output call returns category + priority + confidence + reason. No chaining.

## Success Criteria

- Inbound emails arrive pre-categorized with priority score
- Threads 3+ messages show one-line summary
- Spam auto-moves to spam folder (confidence > 0.85)
- Priority inbox view sorts by priority then date
- Triage adds < 2s latency to email receive pipeline
