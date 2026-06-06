---
title: "Knowledge Base RAG per Domain for AI Craft"
description: "Per-mailbox knowledge base (brand voice, products, policies, FAQ) stored in R2 + dedicated Vectorize index. RAG pipeline injects relevant KB chunks into craftReplyBody at generation time."
status: pending
priority: P2
branch: "main"
tags: ["ai", "rag", "vectorize", "knowledge-base", "craft"]
blockedBy: []
blocks: []
created: "2026-06-06T02:12:47.627Z"
createdBy: "ck:plan"
source: skill
---

# Knowledge Base RAG per Domain for AI Craft

## Overview

`craftReplyBody` currently has no brand or domain context — replies are generic. This plan adds a per-mailbox knowledge base (articles: brand voice, policies, FAQ, product info) that is semantically indexed. When a user triggers AI craft, the incoming email is embedded and the top-3 most relevant KB chunks are injected into the generation prompt.

**Brainstorm report:** `plans/reports/brainstorm-260606-0856-knowledge-base-rag-per-domain-report.md`

## Architecture

```
R2 BUCKET
└── knowledge/{mailboxId}/{articleId}.json   — full article (title, content, category, timestamps)

Vectorize index: "knowledge-base" (768 dims, cosine similarity)
└── ID: {mailboxId}:{articleId}:{chunkIndex}
    metadata: { mailboxId, articleId, title, category, type: "kb" }

Chunking: max 2000 chars/chunk, split at paragraph boundaries

Craft flow:
  1. Embed incoming email (subject + body, 500 chars)
  2. Query "knowledge-base": filter { mailboxId }, topK=3
  3. Inject matched chunk content into craftReplyBody system prompt
```

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Infrastructure](./phase-01-infrastructure.md) | Pending |
| 2 | [Backend KB API](./phase-02-backend-kb-api.md) | Pending |
| 3 | [AI Craft Integration](./phase-03-ai-craft-integration.md) | Pending |
| 4 | [Frontend Settings UI](./phase-04-frontend-settings-ui.md) | Pending |

## Key Files

| File | Action |
|------|--------|
| `wrangler.jsonc` | Add `KNOWLEDGE_VECTORIZE` binding (dev + production envs) |
| `workers/types.ts` | Auto-updated by `npm run cf-typegen` after wrangler change |
| `workers/lib/knowledge-vectorize.ts` | New: KB embed/search/delete helpers |
| `workers/lib/ai.ts` | `craftReplyBody` + optional `knowledgeContext` param |
| `workers/index.ts` | ai-craft handler queries KB before crafting |
| `workers/routes/knowledge-routes.ts` | New: KB CRUD routes |
| `app/services/api.ts` | KB API methods |
| `app/components/settings/knowledge-base-settings-section.tsx` | New: KB tab UI component |
| `app/routes/settings.tsx` | Import + wire KB section |

## Dependencies

- Vectorize index `knowledge-base` must be provisioned in CF dashboard **before** Phase 1 deploy
- Existing `VECTORIZE` (email-embeddings) is unaffected — separate binding + index
