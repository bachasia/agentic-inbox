# Brainstorm: Knowledge Base RAG per Domain for AI Craft

**Date:** 2026-06-06  
**Outcome:** Approved for planning

## Problem Statement

`craftReplyBody` currently generates replies using only the incoming email + thread context. No brand voice, product knowledge, policies, or FAQs are available. Replies can be generic and miss domain-specific context.

## Requirements

- Per-mailbox/domain knowledge base (articles: brand voice, product info, policies, FAQ)
- RAG pipeline: relevant KB chunks injected into craft reply at generation time
- Scale: 50–200 articles/mailbox, some articles long (need chunking)
- UI: Settings page tab for CRUD management of KB articles
- Storage: R2 (raw articles) + dedicated Vectorize index (embeddings)

## Evaluated Approaches

### Option A: Static `craftKnowledge` field in settings (R2 JSON)
- Pro: Zero new infra, works immediately
- Con: No semantic retrieval, token limit, hard to manage many articles

### Option B: RAG with shared Vectorize index (namespace: `kb:{mailboxId}:{chunkId}`)
- Pro: Reuses existing infra, no new bindings
- Con: Mixes email and KB vectors, filter logic more complex

### Option C: RAG with dedicated Vectorize index ✅ SELECTED
- Pro: Clean separation, dedicated `KNOWLEDGE_VECTORIZE` binding, no leakage from email vectors
- Con: Must provision new Vectorize index in CF dashboard before deploy

## Selected Solution

**R2 + dedicated Vectorize index + RAG injection**

```
Storage:
  R2: knowledge/{mailboxId}/{articleId}.json  ← raw article (title, content, category)
  Vectorize (index: "knowledge-base", 768 dims, cosine):
    ID: {mailboxId}:{articleId}:{chunkIndex}
    metadata: { mailboxId, articleId, title, category, type: "kb" }

Chunking: max 2000 chars/chunk, split at paragraph boundaries

Craft flow:
  1. Embed incoming email (subject + body, 500 chars)
  2. Query "knowledge-base" Vectorize: filter mailboxId, topK=3
  3. Load matched chunk content from R2 (or metadata)
  4. Inject top chunks into craftReplyBody system prompt
```

## Implementation Scope

| File | Change |
|------|--------|
| `wrangler.jsonc` | Add `KNOWLEDGE_VECTORIZE` binding |
| `workers/types.ts` | Add `KNOWLEDGE_VECTORIZE: VectorizeIndex` to Env |
| `workers/lib/knowledge-vectorize.ts` | KB embed/search/delete helpers (new file) |
| `workers/lib/ai.ts` | `craftReplyBody` + optional `knowledgeContext` param |
| `workers/index.ts` | ai-craft handler queries KB before crafting |
| `workers/routes/knowledge-routes.ts` | KB CRUD API routes (new file) |
| `app/services/api.ts` | KB API methods |
| `app/routes/settings.tsx` | Knowledge Base tab + CRUD UI |

## Risks

- Vectorize index must be provisioned manually before wrangler deploy
- Chunking logic adds complexity; paragraph split may produce uneven chunks
- topK=3 chunks ≈ 600–900 extra chars in prompt — monitor token usage

## Related Plans

- `plans/260602-2256-knowledge-base-automation/` — email embeddings/semantic search (different concern, shares Vectorize infrastructure pattern)
