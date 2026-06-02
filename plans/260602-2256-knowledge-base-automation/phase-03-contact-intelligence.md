# Phase 5.3: Contact Intelligence

**Priority:** Medium
**Status:** Pending
**Depends on:** Phase 5.1 (embeddings for topic extraction context), existing `contacts` table (migration 11)

## Context Links

- [Contacts table schema](../../workers/db/schema.ts) — `contacts` with email, name, frequency
- [Contact DO methods](../../workers/durableObject/index.ts) — `upsertContact()`, `getContacts()`
- [Contacts API](../../workers/index.ts) — `/api/v1/mailboxes/:id/contacts`
- [Contacts frontend query](../../app/queries/contacts.ts)

## Overview

Enrich the existing contacts system with intelligence: communication frequency over time, average response time, topics discussed, and a relationship strength score. All computed from existing email data via SQL aggregation + lightweight AI topic extraction.

## Key Insights

- `contacts` table already tracks `email`, `name`, `frequency` (total count). Need to add computed fields or a separate materialized stats approach.
- Response time: measure time between received email from contact → user's reply in same thread. SQL query on `emails` table joining thread_id + folder.
- Topics: extract top-3 topics from recent emails with a contact. Use llama-4-scout for structured output. Cache result, refresh weekly or on-demand.
- Relationship score: heuristic formula = `log(frequency) * 0.4 + recency_factor * 0.3 + response_speed_factor * 0.3`. No ML needed.
- No new table needed — extend `contacts` table with computed columns or store intelligence in a new `contact_intelligence` column (JSON blob) to avoid wide schema.

## Requirements

### Functional
- Migration 17: add `intelligence` JSON column to `contacts` table
- DO method: `computeContactIntelligence(contactEmail)` — aggregates stats from emails
- DO method: `getContactIntelligence(contactEmail)` — returns cached intelligence or computes fresh
- API endpoint: `GET /api/v1/mailboxes/:id/contacts/:contactEmail/intelligence`
- Agent tool: `toolGetContactIntelligence(contactEmail)` — for agent to look up contact details
- Frontend: contact detail panel showing stats (accessed from contact autocomplete or email header)

### Non-functional
- Intelligence computation < 2s per contact (SQL aggregation)
- Cache intelligence for 7 days, refresh on-demand or when new email from contact arrives
- Graceful: if no emails from contact found, return empty stats

## Architecture

```
contact_intelligence JSON blob structure:
{
  totalEmails: number,         -- total emails exchanged
  emailsSent: number,          -- emails user sent to this contact
  emailsReceived: number,      -- emails received from this contact
  firstContact: string,        -- ISO date of first email
  lastContact: string,         -- ISO date of most recent email
  avgResponseTimeHours: number | null,  -- average reply time
  topTopics: string[],         -- top 3 topics (AI-extracted)
  relationshipScore: number,   -- 0-100 heuristic score
  computedAt: string           -- ISO datetime of last computation
}

Computation flow:
  getContactIntelligence(email)
    → Check contacts.intelligence JSON, if fresh (< 7 days) → return cached
    → SQL: COUNT emails where sender/recipient = email, GROUP BY folder
    → SQL: AVG time between received + reply in same thread
    → AI: extract top topics from last 20 email subjects with this contact
    → Compute relationship score
    → UPDATE contacts SET intelligence = JSON blob
    → Return
```

## Related Code Files

### Modify
- `workers/durableObject/migrations.ts` — migration 17 (add intelligence column)
- `workers/db/schema.ts` — update contacts table with intelligence column
- `workers/durableObject/index.ts` — add `computeContactIntelligence()`, `getContactIntelligence()`
- `workers/index.ts` — add intelligence API endpoint
- `workers/lib/tools.ts` — add `toolGetContactIntelligence()`
- `workers/agent/index.ts` — register new tool
- `app/services/api.ts` — add `getContactIntelligence()` API call
- `app/types/index.ts` — add `ContactIntelligence` interface

### Create
- `app/components/ContactIntelligencePanel.tsx` — contact stats display component
- `app/queries/contact-intelligence.ts` — React Query hook

## Implementation Steps

1. **Migration 17** in `workers/durableObject/migrations.ts`:
   ```sql
   ALTER TABLE contacts ADD COLUMN intelligence TEXT;
   ```

2. **Drizzle schema** — update contacts table with `intelligence` text column

3. **Frontend types** in `app/types/index.ts`:
   ```ts
   export interface ContactIntelligence {
     totalEmails: number;
     emailsSent: number;
     emailsReceived: number;
     firstContact: string;
     lastContact: string;
     avgResponseTimeHours: number | null;
     topTopics: string[];
     relationshipScore: number;
     computedAt: string;
   }
   ```

4. **DO method `computeContactIntelligence(contactEmail)`**:
   - Query 1: `SELECT COUNT(*), folder FROM emails WHERE sender LIKE '%contactEmail%' OR recipient LIKE '%contactEmail%' GROUP BY folder`
   - Query 2: response time — find thread pairs where contact sent email, user replied:
     ```sql
     SELECT AVG(julianday(reply.date) - julianday(orig.date)) * 24 as avg_hours
     FROM emails orig
     JOIN emails reply ON reply.thread_id = orig.thread_id
     WHERE orig.sender LIKE '%contactEmail%'
       AND reply.folder = 'sent'
       AND reply.date > orig.date
     ```
   - Query 3: `SELECT subject FROM emails WHERE sender LIKE '%contactEmail%' OR recipient LIKE '%contactEmail%' ORDER BY date DESC LIMIT 20`
   - AI: pass 20 subjects to llama-4-scout → "Extract top 3 discussion topics from these email subjects" → structured output `string[]`
   - Score: `min(100, log10(totalEmails + 1) * 20 + recencyDays < 7 ? 30 : recencyDays < 30 ? 15 : 0 + avgResponseHours < 24 ? 30 : avgResponseHours < 72 ? 15 : 0)`

5. **DO method `getContactIntelligence(contactEmail)`**:
   - Fetch contact row → check `intelligence` JSON → if `computedAt` < 7 days ago, return cached
   - Else call `computeContactIntelligence()` → update row → return

6. **API endpoint** `GET /api/v1/mailboxes/:id/contacts/:contactEmail/intelligence`:
   - Forward to DO `getContactIntelligence(decodeURIComponent(contactEmail))`
   - Return JSON response

7. **Agent tool** `toolGetContactIntelligence(contactEmail)`:
   - Description: "Get intelligence about a contact: email frequency, response time, topics discussed, relationship score."
   - Returns formatted string with stats

8. **Frontend**:
   - `app/queries/contact-intelligence.ts` — `useContactIntelligence(mailboxId, contactEmail)` hook
   - `app/components/ContactIntelligencePanel.tsx` — card showing stats with simple bar charts for frequency, badges for topics, score gauge
   - Integrate: show panel when clicking contact name in email header or contact autocomplete dropdown

## Todo List

- [ ] Add migration 17 (intelligence column on contacts)
- [ ] Update Drizzle schema for contacts
- [ ] Add ContactIntelligence type to frontend
- [ ] Implement `computeContactIntelligence()` DO method
- [ ] Implement `getContactIntelligence()` DO method with caching
- [ ] Add intelligence API endpoint
- [ ] Add `toolGetContactIntelligence()` agent tool
- [ ] Register tool in EmailAgent
- [ ] Add frontend API service method
- [ ] Create React Query hook for contact intelligence
- [ ] Create ContactIntelligencePanel component
- [ ] Integrate panel into email view
- [ ] Verify build compiles

## Success Criteria

- `/contacts/:email/intelligence` returns stats within 2s
- Cached intelligence served instantly on repeat requests
- Agent can answer "How often do I talk to Alice?" using the tool
- Relationship score makes intuitive sense (frequent + recent + fast replies = high)
- Topic extraction produces 3 meaningful topics from email subjects

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| LIKE queries on sender/recipient are slow for large mailboxes | Slow intelligence computation | Index on sender already exists. Accept first-computation latency, cache result. |
| Response time calculation misses emails not in threads | Underestimates response speed | Accept — thread-based is the reliable signal. Non-threaded emails are noise. |
| Topic extraction is noisy for generic subjects ("Re: Hi") | Useless topics | Filter out subjects shorter than 5 chars or starting with "Re:" before extraction |

## Security Considerations

- Contact intelligence contains aggregated PII (communication patterns) — same auth scope as email access
- `contactEmail` parameter must be URL-decoded safely — no SQL injection (Drizzle parameterizes)
- Intelligence JSON is stored per-contact in the same DO as emails — no cross-mailbox exposure
