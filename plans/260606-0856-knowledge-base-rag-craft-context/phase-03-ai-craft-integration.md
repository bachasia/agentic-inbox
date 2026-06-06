---
phase: 3
title: "AI Craft Integration"
status: pending
effort: "1h"
dependencies: [2]
---

# Phase 3: AI Craft Integration

## Overview

Update `craftReplyBody` to accept optional `knowledgeContext` and the ai-craft handler in `workers/index.ts` to query the KB before generating. Fail-open: if `KNOWLEDGE_VECTORIZE` is absent or query fails, craft proceeds without KB context.

## Requirements

- Functional: relevant KB chunks injected into system prompt at craft time
- Non-functional: fail-open — missing/failing Vectorize must not break craft
- Non-functional: max 3 chunks injected (~900 chars extra) to stay within token budget

## Architecture

### craftReplyBody signature change (workers/lib/ai.ts)

```ts
// Before:
export async function craftReplyBody(
  ai: Ai,
  email: { subject: string; body: string; sender: string },
  threadContext?: Array<{ sender: string; body: string }>,
): Promise<string | null>

// After:
export async function craftReplyBody(
  ai: Ai,
  email: { subject: string; body: string; sender: string },
  threadContext?: Array<{ sender: string; body: string }>,
  knowledgeContext?: string,   // pre-formatted KB snippets
): Promise<string | null>
```

System prompt injection:
```ts
const systemPrompt = knowledgeContext
  ? `${CRAFT_REPLY_PROMPT}\n\n## Knowledge Base Context\nUse the following information when relevant:\n${knowledgeContext}`
  : CRAFT_REPLY_PROMPT;
```

### ai-craft handler update (workers/index.ts)

```ts
// After fetching email + thread context, before craftReplyBody:
let knowledgeContext: string | undefined;
if ((c.env as any).KNOWLEDGE_VECTORIZE) {
  const query = `${email.subject ?? ""} ${stripHtmlToText(email.body ?? "").slice(0, 300)}`;
  const chunks = await searchKbChunks(
    (c.env as any).KNOWLEDGE_VECTORIZE,
    c.env.AI,
    query,
    mailboxId,
    3,
  );
  if (chunks.length > 0) {
    knowledgeContext = chunks
      .map(ch => `[${ch.category}] ${ch.title}:\n${ch.content}`)
      .join("\n\n");
  }
}

const body = await craftReplyBody(c.env.AI, emailData, threadContext, knowledgeContext);
```

## Related Code Files

- Modify: `workers/lib/ai.ts` — `craftReplyBody` optional 4th param
- Modify: `workers/index.ts` — ai-craft handler queries KB

## Implementation Steps

1. In `workers/lib/ai.ts`:
   - Add `knowledgeContext?: string` as 4th param to `craftReplyBody`
   - Compute `systemPrompt` conditionally (see above)
   - Pass `systemPrompt` instead of `CRAFT_REPLY_PROMPT` to messages array

2. In `workers/index.ts` ai-craft handler:
   - Import `searchKbChunks` from `./lib/knowledge-vectorize`
   - After `threadContext` is built, add KB query block (fail-open with try/catch)
   - Pass `knowledgeContext` to `craftReplyBody`

3. Run `npx tsc --noEmit`

## Success Criteria

- [ ] Craft reply with KB articles present injects KB context into generation
- [ ] Craft still works when `KNOWLEDGE_VECTORIZE` binding absent (dev without binding) — no error thrown
- [ ] Craft still works when KB is empty — `knowledgeContext` is `undefined`, prompt unchanged
- [ ] `npx tsc --noEmit` passes

## Risk Assessment

- `(c.env as any).KNOWLEDGE_VECTORIZE` cast required until Phase 1 `cf-typegen` runs in all envs — acceptable pattern (already used for VECTORIZE in `tools.ts`)
- Extra ~900 chars in prompt increases token usage slightly — within `llama-4-scout` limits
