# Phase 5: Knowledge Base & Automation

**Status:** In Progress (5.1–5.4 complete, 5.5 pending)
**Priority:** High
**Depends on:** Phase 4 (Proactive AI Assistant — action items, alarms, digest)
**Estimated effort:** 5 sub-phases (~3 weeks)

## Goal

Turn the inbox from a message viewer into a knowledge system. Emails become searchable by meaning (not just keywords), the agent answers questions about past conversations, contacts get relationship intelligence, and rules automate repetitive inbox management — all on Cloudflare-native infra (Vectorize + Workers AI).

## Architecture Overview

```
New bindings (wrangler.jsonc):
  VECTORIZE  — Cloudflare Vectorize index for email embeddings

receiveEmail() pipeline additions:
  ...existing triage + notify + extract...
  9. ▶ Embed email body → Vectorize upsert (NEW, waitUntil)
  10. ▶ Evaluate rules → auto-actions (NEW, waitUntil)

New tables (DO SQLite):
  email_embeddings   — tracks which emails have been embedded (sync state)
  automation_rules   — if/then rules for inbound email processing
  webhooks           — outbound webhook registrations
  email_analytics    — daily aggregated stats (emails in/out, response times)

Agent tools (new):
  semanticSearch()      — Vectorize query → retrieve matching emails → answer
  getContactIntelligence() — aggregated contact stats + topics

API endpoints (new):
  /api/v1/mailboxes/:id/semantic-search   — vector + keyword hybrid search
  /api/v1/mailboxes/:id/ask               — Q&A over email history
  /api/v1/mailboxes/:id/contacts/:contactId/intelligence — contact deep stats
  /api/v1/mailboxes/:id/rules             — CRUD automation rules
  /api/v1/mailboxes/:id/webhooks          — CRUD outbound webhooks
  /api/v1/mailboxes/:id/analytics         — email stats dashboard data
```

**AI model choices:**
- Embedding: `@cf/baai/bge-base-en-v1.5` (768 dimensions, fast, free on Workers AI)
- Q&A synthesis: `@cf/moonshotai/kimi-k2.5` (existing, good at reasoning over retrieved context)
- Contact topic extraction: `@cf/meta/llama-4-scout-17b-16e-instruct` (existing, fast structured output)

**Storage:** Vectorize for embeddings. DO SQLite for sync state, rules, webhooks, analytics. R2 mailbox settings JSON for rule/webhook config backup.

## Phases

| Phase | Title | Status | Description |
|-------|-------|--------|-------------|
| 5.1 | [Semantic search](phase-01-semantic-search.md) | **Complete** | Vectorize binding, embedding pipeline, hybrid search UI |
| 5.2 | [Q&A over email history](phase-02-qa-email-history.md) | **Complete** | Agent tool for natural language questions, RAG pipeline |
| 5.3 | [Contact intelligence](phase-03-contact-intelligence.md) | **Complete** | Per-contact stats, topics, response times, relationship scoring |
| 5.4 | [Rules & filters](phase-04-rules-and-filters.md) | **Complete** | If/then automation engine, rule builder UI, evaluate on inbound |
| 5.5 | [Webhooks & analytics](phase-05-webhooks-and-analytics.md) | Pending | Outbound event webhooks, email stats dashboard |

## Key Decisions

- **Cloudflare Vectorize over external vector DB.** Native binding, no latency penalty, free tier generous for personal use. 768-dim BGE model is the best available on Workers AI.
- **Hybrid search: vector + SQL.** Semantic search augments existing full-text, doesn't replace it. User can still use Gmail-style operators. Vector results re-ranked by recency + triage priority.
- **Embed on inbound only (forward).** No retroactive backfill of old emails in Phase 5.1 — add backfill as optional CLI/API later to control cost. Track embedded state in `email_embeddings` table.
- **RAG for Q&A, not fine-tuning.** Retrieve top-K relevant emails via Vectorize, pass as context to kimi-k2.5 for answer synthesis. Simple, no training infra needed.
- **Contact intelligence is aggregation-based.** SQL queries over existing `emails` + `contacts` tables. AI only for topic extraction (one-time per contact, cached). No new ML models.
- **Rules engine is simple if/then.** No complex DAG or scripting. Conditions: from, subject, body contains, category, priority. Actions: label, move, archive, auto-reply template, notify, webhook. Evaluated in `receiveEmail()` after triage.
- **Webhooks are fire-and-forget.** POST with retry (1x after 30s). Events: email.received, email.sent, label.applied, rule.triggered. Stored in `webhooks` table.
- **Analytics are daily aggregates.** Cron-like DO alarm computes daily stats at midnight. Stored in `email_analytics` table. Frontend renders simple charts.
- **Fail-open everywhere.** Embedding failure, rule evaluation error, webhook timeout — none block email delivery.

## Dependencies on Prior Phases

| Dependency | Source | Used By |
|------------|--------|---------|
| `pending_alarms` table + alarm handler | Phase 2 (migration 12) | Analytics daily alarm |
| Triage columns (`triage_category`, `triage_priority`) | Phase 3 (migration 14) | Rule conditions, search ranking |
| `contacts` table with frequency | Phase 2 (migration 11) | Contact intelligence queries |
| `action_items` table | Phase 4 (migration 15) | Contact intelligence (pending tasks per contact) |
| Telegram/Discord notification helpers | Phase 1 | Webhook + rule notification actions |
| `labels` + `email_labels` tables | Phase 2 (migration 9) | Rule actions (auto-label) |

## Success Criteria

- Semantic search finds emails that keyword search misses ("that budget email from Alice" → matches even if "budget" not in subject)
- Agent answers "What did Bob say about the deadline?" with cited email references
- Contact detail page shows: email count, avg response time, top topics, relationship score
- Rules auto-process inbound email (auto-archive newsletters, auto-label by sender)
- Webhooks fire within 5s of triggering event
- Analytics dashboard shows sent/received trends, busiest hours, top contacts
- Zero regression on existing email pipeline
