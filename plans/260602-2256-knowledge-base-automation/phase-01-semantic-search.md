# Phase 5.1: Semantic Search with Vectorize

**Priority:** High
**Status:** Pending
**Depends on:** Phase 4 complete (migration 15), wrangler.jsonc Vectorize binding

## Context Links

- [Current search DO method](../../workers/durableObject/index.ts) — `searchEmails()` + `#buildSearchConditions()`
- [Search API route](../../workers/index.ts) — `/api/v1/mailboxes/:id/search`
- [Frontend search parser](../../app/lib/search-parser.ts) — Gmail-style operators
- [Search results page](../../app/routes/search-results.tsx)
- [AI functions](../../workers/lib/ai.ts)
- [wrangler config](../../wrangler.jsonc)

## Overview

Add semantic (meaning-based) search alongside existing keyword search. Uses Cloudflare Vectorize for email body embeddings and BGE model for encoding. Hybrid approach: vector similarity for recall, SQL filters for precision, combined ranking.

## Key Insights

- Vectorize index is per-account, not per-DO. Namespace emails by `{mailboxId}:{emailId}` to isolate mailboxes within one index.
- BGE-base-en-v1.5 produces 768-dim vectors, max 512 tokens input. Email bodies longer than ~2000 chars need truncation or chunking. Start with truncation (simpler), chunk later if quality suffers.
- Vectorize supports metadata filtering — store `mailboxId`, `folder`, `date` as metadata for scoped queries.
- Existing search UI and parser can be extended — add a toggle "Semantic search" or auto-detect natural language queries vs operator queries.
- Embedding on `receiveEmail()` uses `waitUntil()` — non-blocking, no latency impact on email delivery.

## Requirements

### Functional
- Vectorize index `email-embeddings` created via wrangler CLI
- Embedding pipeline: on inbound email, embed body → upsert to Vectorize
- `email_embeddings` tracking table (migration 16) — records which emails are embedded
- Hybrid search endpoint: accepts natural language query, returns vector-matched emails re-ranked with SQL filters
- Frontend: semantic search toggle in search bar, results show relevance score

### Non-functional
- Embedding latency < 500ms per email (BGE is fast on Workers AI)
- Search query latency < 1s for top-20 results
- Graceful degradation: if Vectorize unavailable, fall back to keyword search

## Architecture

```
Embedding pipeline (inbound email):
  receiveEmail()
    → ctx.waitUntil(embedAndStore(email))
      → Workers AI: bge-base-en-v1.5(truncate(body, 2000))
      → Vectorize.upsert([{ id: mailboxId:emailId, values: [...768], metadata: { mailboxId, folder, date } }])
      → DO SQLite: INSERT INTO email_embeddings (email_id, embedded_at)

Semantic search query:
  /api/v1/mailboxes/:id/semantic-search?q=natural+language+query
    → Workers AI: bge-base-en-v1.5(query)
    → Vectorize.query({ vector, topK: 50, filter: { mailboxId } })
    → DO: fetch email details for matched IDs
    → Rank: combine vector score + recency + triage_priority
    → Return top 20

Hybrid search (auto-detect):
  If query has operators (from:, to:, subject:, etc.) → SQL search (existing)
  If query is natural language → semantic search
  If both → intersect results
```

### DB Schema

```sql
-- Migration 16: email_embeddings tracking
CREATE TABLE email_embeddings (
  email_id   TEXT NOT NULL PRIMARY KEY,
  embedded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Vectorize Index Config

```
Name: email-embeddings
Dimensions: 768
Metric: cosine
Metadata indexes: mailboxId (string), folder (string), date (string)
```

## Related Code Files

### Modify
- `wrangler.jsonc` — add Vectorize binding `VECTORIZE`
- `workers/index.ts` — add `/api/v1/mailboxes/:id/semantic-search` endpoint, embed in `receiveEmail()` pipeline
- `workers/durableObject/index.ts` — add `email_embeddings` table queries, `getEmailsByIds()` helper
- `workers/durableObject/migrations.ts` — migration 16
- `workers/db/schema.ts` — add `emailEmbeddings` table
- `workers/lib/ai.ts` — add `embedText()` function
- `app/services/api.ts` — add `semanticSearch()` API call
- `app/routes/search-results.tsx` — add semantic toggle, relevance scores
- `app/lib/search-parser.ts` — add `isNaturalLanguage()` detection

### Create
- `workers/lib/vectorize.ts` — Vectorize upsert/query helpers (embed, search, delete)

## Implementation Steps

1. **Vectorize index creation** (CLI):
   ```bash
   npx wrangler vectorize create email-embeddings --dimensions 768 --metric cosine
   ```

2. **wrangler.jsonc** — add binding:
   ```jsonc
   "vectorize": [{ "binding": "VECTORIZE", "index_name": "email-embeddings" }]
   ```

3. **Migration 16** in `workers/durableObject/migrations.ts`:
   ```sql
   CREATE TABLE email_embeddings (
     email_id   TEXT NOT NULL PRIMARY KEY,
     embedded_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   ```

4. **Drizzle schema** in `workers/db/schema.ts` — add `emailEmbeddings` table

5. **`workers/lib/vectorize.ts`** — helper module:
   - `embedText(ai, text: string): Promise<number[]>` — call BGE model, truncate input to 2000 chars
   - `upsertEmbedding(vectorize, id, values, metadata)` — Vectorize upsert wrapper
   - `searchSimilar(vectorize, ai, query, mailboxId, topK)` — embed query → Vectorize.query with mailboxId filter
   - `deleteEmbedding(vectorize, id)` — cleanup on email delete

6. **`workers/lib/ai.ts`** — add `embedText()`:
   ```ts
   export async function embedText(ai: Ai, text: string): Promise<number[]> {
     const truncated = text.slice(0, 2000);
     const result = await ai.run('@cf/baai/bge-base-en-v1.5', { text: [truncated] });
     return result.data[0];
   }
   ```

7. **`receiveEmail()` pipeline** — after action item extraction:
   ```ts
   ctx.waitUntil(
     embedText(env.AI, `${subject} ${plainBody}`).then(vector =>
       env.VECTORIZE.upsert([{
         id: `${mailboxId}:${emailId}`,
         values: vector,
         metadata: { mailboxId, folder: folderId, date: email.date }
       }])
     ).then(() => mailboxDO.markEmbedded(emailId))
     .catch(err => console.error('Embedding failed:', err))
   );
   ```

8. **DO methods**:
   - `markEmbedded(emailId)` — INSERT into email_embeddings
   - `getEmailsByIds(ids: string[])` — fetch full email objects by ID list (for vector result hydration)
   - `isEmbedded(emailId)` — check if email has embedding

9. **API endpoint** `/api/v1/mailboxes/:id/semantic-search`:
   - Parse query string `?q=...&limit=20`
   - Call `searchSimilar()` → get `{ id, score }[]`
   - Extract emailIds, call DO `getEmailsByIds()`
   - Rank: `finalScore = vectorScore * 0.7 + recencyScore * 0.2 + priorityScore * 0.1`
   - Return `{ emails: Email[], scores: number[] }`

10. **Frontend updates**:
    - `app/services/api.ts` — add `semanticSearch(mailboxId, query, limit)` function
    - `app/routes/search-results.tsx` — detect natural language query → call semantic endpoint; show relevance badge on results
    - `app/lib/search-parser.ts` — add `isNaturalLanguage(query)`: returns true if query has no operators and looks like a question or phrase

11. **Email deletion cleanup** — when email is deleted, also call `env.VECTORIZE.deleteByIds([mailboxId:emailId])`

## Todo List

- [ ] Create Vectorize index via wrangler CLI
- [ ] Add Vectorize binding to wrangler.jsonc
- [ ] Add migration 16 (email_embeddings table)
- [ ] Add emailEmbeddings to Drizzle schema
- [ ] Create `workers/lib/vectorize.ts` helper module
- [ ] Add `embedText()` to ai.ts
- [ ] Integrate embedding into `receiveEmail()` pipeline
- [ ] Add DO methods: markEmbedded, getEmailsByIds, isEmbedded
- [ ] Add semantic-search API endpoint
- [ ] Add semanticSearch to frontend API service
- [ ] Update search results page with semantic toggle
- [ ] Add natural language detection to search parser
- [ ] Handle embedding cleanup on email delete
- [ ] Verify build compiles

## Success Criteria

- New inbound emails get embedded within 1s of arrival (non-blocking)
- `semantic-search` endpoint returns relevant results for natural language queries
- "Find the email where Alice mentioned the budget" returns the correct email even if "budget" isn't in the subject
- Fallback to keyword search works when Vectorize is unavailable
- Build clean, no type errors

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Vectorize free tier limits (5M vectors) | Blocks embedding at scale | Personal use = thousands, not millions. Monitor count. |
| BGE truncation loses context from long emails | Misses relevant content in long threads | Embed `subject + first 2000 chars of body`. Can add chunking in future. |
| Vectorize cold start latency | Slow first query | Accept — personal use, not high-traffic. Cache warm with periodic keep-alive if needed. |
| Embedding model quality for non-English | Poor recall for non-English emails | BGE-base-en is English-focused. Multilingual model (`bge-m3`) not on Workers AI yet. Accept for now. |

## Security Considerations

- Vectorize metadata must include `mailboxId` and all queries must filter by it — no cross-mailbox leakage
- Embedding vectors are derived from email content — same sensitivity as raw emails
- No PII stored in Vectorize beyond what's in the email itself
