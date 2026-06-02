# Brainstorm: Agentic Inbox Full Development Roadmap

**Date:** 2026-06-02
**Goal:** Transform Agentic Inbox into a polished personal daily-driver email client with full AI assistant capabilities.
**Constraints:** Standalone (no Gmail/Outlook sync), stay on Workers AI (kimi-k2.5), Telegram/Discord notifications, Cloudflare-native stack.

---

## Problem Statement

Current state is a functional MVP: email CRUD, threading, folders, search, attachments, basic AI auto-draft, MCP server. Missing: notifications, labels, snooze, scheduled send, smart triage, proactive assistant, semantic search, contact intelligence, automation rules, tests, CI/CD.

---

## Proposed Roadmap (6 Phases)

### Phase 1: Foundation & Notifications (1 week)

**Why first:** Daily-driver readiness requires knowing when emails arrive without checking the tab.

| Feature | Description | Arch Notes |
|---------|-------------|------------|
| **Telegram notifications** | Webhook POST to Telegram Bot API on inbound email. Configurable per-mailbox: on/off, bot token, chat ID. | Add `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` to mailbox settings (R2 JSON). Fire from `receiveEmail()` in `workers/index.ts`. |
| **Discord notifications** | Webhook POST to Discord channel webhook URL. Same config pattern. | Discord webhook URL in mailbox settings. Same trigger point. |
| **Notification preferences UI** | Settings page section for Telegram/Discord config. Test button to verify. | Extend `app/routes/settings.tsx`. New API endpoint `POST /api/v1/mailboxes/:id/test-notification`. |
| **Email signature editor** | Rich text signature editing in settings, previewed live. Currently only plain text via agent prompt. | Store in mailbox R2 settings. Frontend: TipTap mini-editor in settings. Backend: inject into compose/reply. |
| **Unread badge in browser tab** | Show unread count in page title: `(3) Inbox - Agentic Inbox`. | Zustand store + periodic query or WebSocket push from DO. |

**Acceptance:** Receive Telegram/Discord message within 5s of inbound email. Signature appears in compose/reply.

---

### Phase 2: Email Client Enrichment (2 weeks)

**Why second:** Core email features that every daily-driver needs.

| Feature | Description | Arch Notes |
|---------|-------------|------------|
| **Labels/tags** | Multi-label system (color + name). Apply to emails. Filter by label. | New `labels` + `email_labels` tables in DO SQLite. Migration 009. Many-to-many. |
| **Snooze** | Snooze email until date/time. Returns to inbox when due. | DO Alarm API (`alarm()` method on MailboxDO). Store snooze_until on email. Alarm fires, moves back to inbox, triggers notification. |
| **Scheduled send** | Compose now, send later at specified time. | Draft with `scheduled_send_at` field. DO Alarm fires `sendEmail()`. UI: datetime picker in ComposePanel. |
| **Email templates** | Save/load reusable email templates (subject + body). | Templates stored in mailbox R2 JSON. CRUD API. Template picker in ComposePanel. |
| **Contact book** | Auto-extract contacts from sent/received emails. Manual add/edit. | New `contacts` table in DO SQLite. Background extraction on email create. UI: contact autocomplete in compose To/Cc/Bcc fields. |
| **Quick actions** | Swipe/keyboard shortcuts: archive, delete, snooze, label. | Frontend-only. Keyboard event handlers + touch gesture detection. |

**Acceptance:** Can label, snooze, schedule, template, and manage contacts from UI. Snooze/schedule fire reliably.

---

### Phase 3: AI Smart Triage (2 weeks)

**Why third:** AI features that reduce manual inbox management.

| Feature | Description | Arch Notes |
|---------|-------------|------------|
| **Auto-categorize** | On inbound email: classify as Personal / Business / Newsletter / Notification / Spam. Apply as label. | Workers AI classification model (or kimi-k2.5 with structured output). Run in `receiveEmail()` pipeline before auto-draft. Store as label. |
| **Priority scoring** | Score 1-5 based on: sender importance, urgency keywords, thread activity, whether you're in To vs Cc. | Scoring function in `workers/lib/ai.ts`. Combine heuristic (sender frequency, To vs Cc) + AI assessment. Store as email metadata field. |
| **Thread summarization** | One-line summary of long threads (3+ messages). Shown in email list and agent panel. | Generate on thread growth (not every email). Cache in email metadata. Workers AI summarization. |
| **Smart spam detection** | Beyond prompt injection: detect marketing, phishing, social engineering. Auto-move to spam with confidence threshold. | Layered: heuristic (link density, sender reputation) + AI classification. Configurable aggressiveness per mailbox. |
| **Priority inbox view** | New virtual folder showing high-priority unread emails first, then recent. | Frontend virtual folder. Backend: query with priority sort + unread filter. |

**Acceptance:** New emails arrive pre-categorized with priority score. Threads show summaries. Spam caught before manual review.

---

### Phase 4: Proactive AI Assistant (2 weeks)

**Why fourth:** Builds on Phase 3's triage to add time-aware intelligence.

| Feature | Description | Arch Notes |
|---------|-------------|------------|
| **Unanswered email reminders** | Track sent emails without replies. After configurable delay (e.g. 3 days), surface in agent panel + notification. | DO Alarm per sent email. Check if reply exists in thread. Notify via Telegram + agent chat. |
| **Action item extraction** | Parse emails for tasks/commitments: "Can you send me X by Friday?" Store as structured items. | AI extraction on inbound. New `action_items` table: email_id, description, due_date, completed. UI: action items sidebar or dashboard. |
| **Follow-up suggestions** | Agent proactively suggests: "You haven't replied to Alice's email from 2 days ago about the contract." | Cron-like DO alarm (daily). Scan inbox for unreplied emails from important contacts. Push to agent chat + notification. |
| **Deadline detection** | Extract dates/deadlines from email content. Show in timeline or calendar view. | Part of action item extraction. Parse "by Friday", "before June 15", etc. Workers AI with date normalization. |
| **Daily digest** | Morning summary: new emails overnight, pending action items, follow-up reminders. Via Telegram or agent panel. | DO alarm at configured time. Aggregate overnight activity. Format as Telegram message or agent chat entry. |

**Acceptance:** Get daily digest on Telegram. See action items extracted. Get reminded about unanswered emails.

---

### Phase 5: Knowledge Base & Automation (3 weeks)

**Why fifth:** Advanced features that compound value over time.

| Feature | Description | Arch Notes |
|---------|-------------|------------|
| **Semantic search** | Search by meaning, not just keywords. "Find the email where Alice talked about the budget proposal." | Cloudflare Vectorize for embeddings. Embed email bodies on create. Hybrid: SQL full-text + vector similarity. |
| **Q&A over email history** | Ask agent: "What did Bob say about the deadline?" Agent searches semantically and answers. | New agent tool: `semantic_search`. Combines Vectorize query + context retrieval + AI answer generation. |
| **Contact intelligence** | Per contact: communication frequency, avg response time, topics discussed, relationship strength score. | Aggregation queries on contact + email data. Materialized views or periodic compute. UI: contact detail page. |
| **Rules & filters** | If-then automation: "If from:newsletter@x.com, auto-archive." "If subject contains 'urgent', label as high-priority." | Rules engine in DO. Evaluate on `receiveEmail()`. Rules stored in mailbox R2 settings. UI: rule builder in settings. |
| **Webhook outbound** | Fire webhooks on events: new email, email sent, label applied. For external automation. | Event system in DO. Webhook URLs in mailbox settings. POST with event payload. |
| **Email analytics** | Dashboard: emails sent/received per day, response times, busiest hours, top contacts. | Aggregate queries on email metadata. Frontend: simple charts (recharts or chart.js). Route: `/mailbox/:id/analytics`. |

**Acceptance:** Can search semantically. Agent answers questions about past emails. Rules auto-process incoming mail.

---

### Phase 6: Infrastructure & Polish (2 weeks)

**Why last:** Reliability and maintainability for long-term daily use.

| Feature | Description | Arch Notes |
|---------|-------------|------------|
| **Unit + integration tests** | Vitest for workers logic. Playwright for frontend E2E. Coverage target: 70%+ for workers/lib. | `vitest.config.ts` + `playwright.config.ts`. Mock DO stubs for unit tests. |
| **CI/CD pipeline** | GitHub Actions: typecheck, lint, test, deploy preview, deploy production. | `.github/workflows/ci.yml`. Wrangler deploy on main push. Preview deploys on PR. |
| **Error tracking** | Structured error logging. Optional Sentry integration or Cloudflare Logpush. | Try/catch standardization. Error boundary improvements. `workers/lib/logger.ts`. |
| **Backup & export** | Export all emails as mbox/EML. Periodic R2 backup of DO SQLite. | Export API endpoint. DO backup via `exportSql()` or periodic snapshot to R2. |
| **PWA support** | Service worker for offline email reading. App manifest for home screen install. | `public/manifest.json`. Service worker caching strategy. Workbox integration. |
| **Dark mode** | System-preference-aware dark theme. Manual toggle. | Tailwind dark mode classes. Theme toggle in header. Persist preference. |
| **Keyboard shortcuts** | Gmail-style shortcuts: j/k navigate, e archive, # delete, r reply, c compose, / search. | Keyboard event system. Help modal (?). No conflicts with TipTap editor. |

**Acceptance:** CI green. Tests passing. Can export emails. Works offline for reading. Dark mode. Keyboard-navigable.

---

## Evaluated Approaches

### Notification System
| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Telegram Bot API webhook | Simple, reliable, rich formatting, free | Requires bot setup | **Recommended** (start here) |
| Discord webhook | Even simpler (just URL), rich embeds | Less personal than Telegram | Add as option |
| Web Push (PWA) | No external service needed | Complex, unreliable on mobile | Phase 6 with PWA |

### Semantic Search
| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Cloudflare Vectorize | Native, no external deps, scales | Limited embedding models, newer service | **Recommended** |
| External (Pinecone/Weaviate) | Mature, more models | External dependency, latency, cost | Overkill for personal use |
| SQLite FTS5 only | Already available in DO | No semantic understanding | Keep as baseline, add vector |

### Snooze / Scheduled Send
| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| DO Alarms | Native CF, exact timing, per-object | One alarm per DO at a time (needs queue) | **Recommended** with alarm queue pattern |
| Cron Trigger polling | Simple, periodic | Minute-level granularity, wasteful | Fallback if alarms insufficient |
| External scheduler (QStash) | Reliable, HTTP-based | External dependency | Unnecessary for personal use |

### AI Classification
| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| kimi-k2.5 with structured output | Already integrated, capable | Token cost per email, slower | Good for complex classification |
| Workers AI classifier model | Fast, cheap, purpose-built | Less nuanced | Good for spam/category |
| Heuristic + AI hybrid | Fast for obvious cases, AI for ambiguous | More code | **Recommended** |

---

## Implementation Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| DO Alarm limitation (1 alarm/DO) | Blocks snooze + scheduled send + reminders | Alarm queue pattern: store all pending events in SQLite, alarm fires for earliest, re-arms for next |
| Workers AI model quality for triage | Poor categorization = noise | Start conservative (high confidence threshold), add user feedback loop to retrain |
| Vectorize index size for semantic search | May hit limits for large mailboxes | Embed only recent emails (1 year), summarize older ones |
| Schema migrations in DO SQLite | Breaking changes in production | Test migrations on staging. Backup DO before migration deploy. Incremental, backward-compatible migrations. |
| Telegram bot token security | Token leak = notification hijack | Store as Worker secret, not in R2 JSON. Or encrypt in R2 with Worker-level key. |

---

## Success Metrics

- **Daily driver test:** Use as primary email client for 2+ weeks without reverting to Gmail
- **AI accuracy:** >80% correct auto-categorization; <5% false positive spam
- **Notification latency:** <5s from email arrival to Telegram notification
- **Search quality:** Semantic search finds relevant emails that keyword search misses
- **Reliability:** Zero missed emails or lost drafts over 30-day period

---

## Priority Order (Recommended)

```
Phase 1 (Foundation)     ████░░░░░░  Week 1
Phase 2 (Email Client)   ████████░░  Weeks 2-3
Phase 3 (AI Triage)      ████████░░  Weeks 4-5
Phase 4 (Proactive AI)   ████████░░  Weeks 6-7
Phase 5 (Knowledge)      ████████████ Weeks 8-10
Phase 6 (Infrastructure) ████████░░  Weeks 11-12
```

**Total estimated:** ~12 weeks at moderate pace.

**Quick win path (if want results fast):** Phase 1 (notifications + signatures) + cherry-pick labels + snooze from Phase 2 + dark mode from Phase 6. Gives ~80% daily-driver readiness in ~2 weeks.

---

## Next Steps

1. User confirms/adjusts phase priorities
2. `/ck:plan` to create detailed implementation plan for first phase
3. Iterate phase by phase, review after each
