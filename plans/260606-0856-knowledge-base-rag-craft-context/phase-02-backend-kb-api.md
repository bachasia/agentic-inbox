---
phase: 2
title: "Backend KB API"
status: pending
effort: "3h"
dependencies: [1]
---

# Phase 2: Backend KB API

## Overview

Implement KB article CRUD: R2 stores raw articles, `workers/lib/knowledge-vectorize.ts` handles chunking + embedding + Vectorize upsert/delete. New `workers/routes/knowledge-routes.ts` exposes REST endpoints under `requireMailbox` middleware.

## Requirements

- Functional: create/read/list/update/delete KB articles per mailbox
- Functional: articles are chunked, embedded, and indexed in Vectorize on create/update
- Functional: vectors are deleted from Vectorize on article delete
- Non-functional: chunking stays within BGE-base 512-token limit (≤2000 chars/chunk)

## Architecture

### Article schema (R2 JSON)

```ts
interface KbArticle {
  id: string;          // nanoid
  title: string;
  content: string;     // markdown/plain text
  category: "brand" | "product" | "policy" | "faq";
  createdAt: string;   // ISO
  updatedAt: string;
}
```

R2 key: `knowledge/{mailboxId}/{articleId}.json`

### Chunking logic

```ts
function chunkText(text: string, maxChars = 2000): string[] {
  // Split on double-newline (paragraph boundaries)
  // If paragraph > maxChars, split on single newline
  // Discard chunks < 50 chars
}
```

### Vectorize helpers (workers/lib/knowledge-vectorize.ts)

```ts
upsertKbArticle(vectorize, ai, mailboxId, article): Promise<void>
  // chunks content → embedText each → vectorize.upsert
  // ID: {mailboxId}:{articleId}:{chunkIndex}
  // metadata: { mailboxId, articleId, title, category, type: "kb" }

deleteKbArticle(vectorize, mailboxId, articleId, chunkCount): Promise<void>
  // vectorize.deleteByIds all chunk IDs for article

searchKbChunks(vectorize, ai, query, mailboxId, topK=3): Promise<KbChunk[]>
  // embedText(query) → vectorize.query filter {mailboxId, type:"kb"}
  // returns [{content, title, category, score}]
```

Note: chunk content is stored in R2 (full article), not in Vectorize metadata (64-byte limit). On search hit, load full article from R2 and extract the relevant chunk by index.

### API endpoints

All under `/api/v1/mailboxes/:mailboxId/knowledge`, protected by `requireMailbox` middleware.

```
GET    /                    → list articles (id, title, category, updatedAt only)
POST   /                    → create article + embed → 201 {id}
GET    /:articleId          → full article
PUT    /:articleId          → update content + re-embed
DELETE /:articleId          → delete R2 + delete Vectorize vectors
```

## Related Code Files

- Create: `workers/lib/knowledge-vectorize.ts`
- Create: `workers/routes/knowledge-routes.ts`
- Modify: `workers/index.ts` — mount knowledge routes

## Implementation Steps

1. Create `workers/lib/knowledge-vectorize.ts` with `chunkText`, `upsertKbArticle`, `deleteKbArticle`, `searchKbChunks`

2. Create `workers/routes/knowledge-routes.ts` following `admin-routes.ts` pattern (Hono app, typed `MailboxContext`):
   ```ts
   import { Hono } from "hono";
   import type { MailboxContext } from "../lib/mailbox";
   const app = new Hono<MailboxContext>();
   // routes...
   export default app;
   ```

3. For `POST /` and `PUT /:articleId`:
   - Parse + validate body (title, content, category)
   - Write to R2: `knowledge/{mailboxId}/{articleId}.json`
   - Call `upsertKbArticle` (delete old chunks first on update, then re-embed)
   - Store chunk count on article for later deletion

4. For `DELETE /:articleId`:
   - Read article from R2 to get chunk count
   - `deleteKbArticle(...)` → Vectorize
   - Delete from R2

5. Mount in `workers/index.ts`:
   ```ts
   import knowledgeRoutes from "./routes/knowledge-routes";
   app.route("/api/v1/mailboxes/:mailboxId/knowledge", knowledgeRoutes);
   ```
   (before other mailbox routes, after `requireMailbox` middleware)

6. Run `npx tsc --noEmit`

## Success Criteria

- [ ] `GET /api/v1/mailboxes/:id/knowledge` returns `[]` for new mailbox
- [ ] `POST` creates article in R2 and vectors appear in Vectorize (`wrangler vectorize query`)
- [ ] `PUT` re-embeds (old vectors removed, new ones inserted)
- [ ] `DELETE` removes R2 object and all chunk vectors
- [ ] `npx tsc --noEmit` passes

## Risk Assessment

- Chunk count not stored on article → can't delete all vectors on update/delete. **Mitigation:** store `chunkCount` field on article JSON.
- Vectorize upsert is eventually consistent — short delay before searchable. Acceptable for this use case.
- R2 is strongly consistent for read-after-write — safe to list immediately after create.
