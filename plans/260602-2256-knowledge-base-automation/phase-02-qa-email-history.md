# Phase 5.2: Q&A Over Email History

**Priority:** High
**Status:** Pending
**Depends on:** Phase 5.1 (Vectorize + embedding pipeline live)

## Context Links

- [Agent tools](../../workers/lib/tools.ts) — existing 16 tools
- [Agent DO](../../workers/agent/index.ts) — EmailAgent with AIChatAgent
- [AI functions](../../workers/lib/ai.ts) — kimi-k2.5 for synthesis
- [Vectorize helpers](../../workers/lib/vectorize.ts) — (created in 5.1)

## Overview

Add a RAG (Retrieval-Augmented Generation) tool to the email agent. User asks a natural language question ("What did Bob say about the deadline?"), agent retrieves semantically relevant emails via Vectorize, and synthesizes an answer with citations.

## Key Insights

- Agent already has `toolSearchEmails()` for keyword search. New `toolSemanticSearch()` supplements it — agent chooses which to use based on query nature.
- RAG pipeline: embed question → Vectorize top-K → fetch full email bodies from DO → pass as context to kimi-k2.5 → answer with `[Email: subject, date]` citations.
- Context window management: kimi-k2.5 handles ~32K tokens. Limit retrieval to top-10 emails, truncate each body to ~1500 chars. Total context: ~15K tokens + system prompt + question.
- Agent can chain: semantic search → read specific email → answer. Don't need to stuff everything in one call.

## Requirements

### Functional
- New agent tool: `semanticSearch(query, limit?)` — returns top-K emails by semantic similarity
- New agent tool: `askAboutEmails(question)` — full RAG pipeline (retrieve + synthesize + cite)
- Agent system prompt updated to describe when to use semantic vs keyword search
- Answers include citations: email subject, date, sender for each referenced email

### Non-functional
- Q&A response time < 5s for typical question
- Graceful fallback: if Vectorize unavailable, agent uses keyword search tool instead
- No hallucinated email content — answer must be grounded in retrieved emails

## Architecture

```
User asks: "What did Bob say about the deadline?"
  → Agent selects askAboutEmails tool
  → embedText(question) → Vectorize.query(top-10, filter: mailboxId)
  → DO.getEmailsByIds(matchedIds) → full email objects
  → Build context: "Email 1: From Bob, Subject: Project timeline, Date: ...\n{body truncated}\n---\nEmail 2: ..."
  → kimi-k2.5 prompt:
      "Based on the following emails, answer the user's question.
       Cite specific emails by [Subject, Date, Sender].
       If the answer isn't in the emails, say so.
       Question: {question}
       ---
       {email context}"
  → Return synthesized answer with citations
```

## Related Code Files

### Modify
- `workers/lib/tools.ts` — add `toolSemanticSearch()` and `toolAskAboutEmails()`
- `workers/agent/index.ts` — register new tools in agent tool list
- `workers/lib/ai.ts` — add `synthesizeAnswer()` function

### No new files

## Implementation Steps

1. **`workers/lib/ai.ts`** — add `synthesizeAnswer()`:
   ```ts
   export async function synthesizeAnswer(
     ai: Ai,
     question: string,
     emailContexts: Array<{ subject: string; from: string; date: string; body: string }>
   ): Promise<string> {
     const context = emailContexts.map((e, i) =>
       `[Email ${i+1}] From: ${e.from} | Subject: ${e.subject} | Date: ${e.date}\n${e.body.slice(0, 1500)}`
     ).join('\n---\n');

     const result = await ai.run('@cf/moonshotai/kimi-k2.5', {
       messages: [
         { role: 'system', content: 'Answer the question based ONLY on the provided emails. Cite sources as [Subject, Date]. If the answer is not in the emails, say "I couldn\'t find relevant information in your emails."' },
         { role: 'user', content: `Question: ${question}\n\n---\nEmails:\n${context}` }
       ],
       max_tokens: 1024,
       temperature: 0.2
     });
     return result.response;
   }
   ```

2. **`workers/lib/tools.ts`** — add `toolSemanticSearch()`:
   - Parameters: `query` (string), `limit` (number, default 10)
   - Calls `searchSimilar()` from vectorize.ts → returns email list with relevance scores
   - Description for agent: "Search emails by meaning/concept, not just keywords. Use when the user asks about a topic, person, or event without exact keywords."

3. **`workers/lib/tools.ts`** — add `toolAskAboutEmails()`:
   - Parameters: `question` (string)
   - Internally: embed question → Vectorize top-10 → fetch emails → `synthesizeAnswer()` → return answer string
   - Description for agent: "Ask a question about the user's email history. Returns a synthesized answer with email citations. Use for questions like 'What did X say about Y?' or 'When was the last time I discussed Z?'"

4. **`workers/agent/index.ts`** — register both tools in the agent's tool array

5. **Agent system prompt update** — add guidance:
   ```
   You have semantic search capabilities. Use `askAboutEmails` for questions about past conversations.
   Use `semanticSearch` when you need to find emails by topic/concept.
   Use `searchEmails` (keyword) when the user provides specific terms, operators, or sender names.
   ```

## Todo List

- [ ] Add `synthesizeAnswer()` to ai.ts
- [ ] Add `toolSemanticSearch()` to tools.ts
- [ ] Add `toolAskAboutEmails()` to tools.ts
- [ ] Register new tools in EmailAgent
- [ ] Update agent system prompt with semantic search guidance
- [ ] Verify build compiles

## Success Criteria

- Agent uses `askAboutEmails` when asked "What did Bob say about X?"
- Answer is grounded in actual emails, not hallucinated
- Citations reference real email subjects and dates
- Agent falls back to keyword search when Vectorize is unavailable
- Response time < 5s for typical Q&A

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Hallucinated citations | User trusts wrong info | System prompt enforces "only from provided emails". Temperature 0.2. |
| Irrelevant retrieval (query doesn't match any emails) | Confusing answer | Model instructed to say "I couldn't find relevant information" |
| Token overflow with many/long emails | Truncated context | Limit to 10 emails, 1500 chars each. ~15K tokens total. |
| Agent picks wrong tool (keyword vs semantic) | Suboptimal results | Clear tool descriptions + system prompt guidance |

## Security Considerations

- All Vectorize queries scoped by `mailboxId` — no cross-mailbox data leakage
- Synthesized answers contain email content — same auth requirements as email viewing
- Agent tool calls are logged and visible in UI (existing behavior)
