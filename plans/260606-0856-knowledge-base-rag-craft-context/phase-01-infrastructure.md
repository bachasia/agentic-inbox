---
phase: 1
title: "Infrastructure"
status: pending
effort: "1h"
dependencies: []
---

# Phase 1: Infrastructure

## Overview

Provision the dedicated `knowledge-base` Vectorize index and add `KNOWLEDGE_VECTORIZE` binding to `wrangler.jsonc` (dev + production). Regenerate CF types so binding is typed.

## Requirements

- Functional: `KNOWLEDGE_VECTORIZE: VectorizeIndex` available in worker `Env` at runtime
- Non-functional: must not touch existing `VECTORIZE` (email-embeddings) binding

## Architecture

```
wrangler.jsonc top-level vectorize array:
  { "binding": "VECTORIZE",           "index_name": "email-embeddings" }   (existing)
  { "binding": "KNOWLEDGE_VECTORIZE", "index_name": "knowledge-base" }     (NEW)

Same pattern under env.production.vectorize array.

Vectorize index spec:
  name:       knowledge-base
  dimensions: 768  (matches BGE-base-en-v1.5 used in workers/lib/vectorize.ts)
  metric:     cosine
```

## Related Code Files

- Modify: `wrangler.jsonc`
- Regenerated: `Cloudflare.Env` auto-updated by `npm run cf-typegen`

## Implementation Steps

1. Provision index via wrangler CLI:
   ```bash
   npx wrangler vectorize create knowledge-base --dimensions=768 --metric=cosine
   ```
   (If production uses a separate CF account, run again with `--env production` or via CF dashboard.)

2. Add to `wrangler.jsonc` — top-level `vectorize` array:
   ```jsonc
   { "binding": "KNOWLEDGE_VECTORIZE", "index_name": "knowledge-base" }
   ```

3. Add to `wrangler.jsonc` — `env.production.vectorize` array:
   ```jsonc
   { "binding": "KNOWLEDGE_VECTORIZE", "index_name": "knowledge-base-production" }
   ```
   (Create `knowledge-base-production` index separately if needed, or reuse `knowledge-base`.)

4. Regenerate types:
   ```bash
   npm run cf-typegen
   ```

5. Verify:
   ```bash
   npx tsc --noEmit
   ```

## Success Criteria

- [ ] `npx wrangler vectorize list` shows `knowledge-base` index
- [ ] `wrangler.jsonc` has `KNOWLEDGE_VECTORIZE` in both dev and production `vectorize` arrays
- [ ] `npm run cf-typegen` succeeds without error
- [ ] `npx tsc --noEmit` passes

## Risk Assessment

- If wrangler CLI version doesn't support `vectorize create`: use CF dashboard manually — low impact
- Missing production binding: craft silently skips KB (fail-open guard coded in Phase 3) — degraded but not broken
