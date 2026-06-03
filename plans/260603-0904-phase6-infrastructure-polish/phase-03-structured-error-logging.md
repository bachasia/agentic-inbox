# Phase 03: Structured Error Logging

## Context Links
- [Plan overview](./plan.md)
- [Cloudflare Workers observability](https://developers.cloudflare.com/workers/observability/)
- `wrangler.jsonc:8` already has `"observability": { "enabled": true }`

## Overview
- **Priority:** P2
- **Status:** pending
- **Effort:** 2h
- **Description:** Replace ad-hoc `console.error` calls with a structured logger. Cloudflare Workers already has `observability.enabled = true` in wrangler config, which sends `console.*` output to Cloudflare's log pipeline. A structured logger standardizes the JSON shape so logs are filterable by component, severity, and error type.
- **Dependencies:** None (independent of other phases)

## Key Insights
- `wrangler.jsonc:8` already enables Cloudflare Logpush/observability -- no external service needed
- Current codebase has 30+ `console.error` calls scattered across workers files, all with inconsistent formats
- Cloudflare Workers `console.log` output is captured by the observability pipeline and can be queried in the dashboard
- No need for Sentry or external error tracking -- Cloudflare's built-in observability is sufficient (YAGNI)
- Logger should be thin (~40 lines) -- just a structured wrapper around console methods

## Requirements

### Functional
- Structured JSON log format with: `timestamp`, `level`, `component`, `message`, `error?`, `metadata?`
- Log levels: `debug`, `info`, `warn`, `error`
- Component tags: `email-receive`, `triage`, `agent`, `api`, `notifications`, `rules`, `vectorize`, `backup`
- Error objects serialized with `name`, `message`, `stack`

### Non-Functional
- Zero external dependencies
- <1ms overhead per log call
- No breaking changes to existing behavior (logs still reach Cloudflare observability)

## Architecture

### Logger Design
```ts
// workers/lib/logger.ts
type LogLevel = "debug" | "info" | "warn" | "error";
type Component = "email-receive" | "triage" | "agent" | "api" | "notifications" | "rules" | "vectorize" | "backup" | "export";

interface LogEntry {
  ts: string;
  level: LogLevel;
  component: Component;
  msg: string;
  error?: { name: string; message: string; stack?: string };
  meta?: Record<string, unknown>;
}

function log(level, component, msg, opts?) → console[level](JSON.stringify(entry))
```

### Data Flow
```
Application code → logger.error("triage", "Triage failed", { error: e, meta: { emailId } })
  ↓
console.error(JSON.stringify({ ts, level: "error", component: "triage", msg: "Triage failed", error: { name, message, stack }, meta: { emailId } }))
  ↓
Cloudflare observability pipeline → dashboard / Logpush
```

## Related Code Files

### Files to Create
| File | Purpose |
|------|---------|
| `workers/lib/logger.ts` | Structured logger module (~40 lines) |

### Files to Modify (console.error → logger calls)

All callers enumerated below with current `console.error` patterns:

| File | Line(s) | Current Pattern | New Call |
|------|---------|----------------|---------|
| `workers/app.ts:123` | `console.error("Failed to process incoming email:", ...)` | `logger.error("email-receive", "Failed to process incoming email", { error: e })` |
| `workers/index.ts:879` | `console.error("Triage failed:", ...)` | `logger.error("triage", "Triage failed", { error: e })` |
| `workers/index.ts:908` | `console.error("Action item extraction failed:", ...)` | `logger.error("triage", "Action item extraction failed", { error: e })` |
| `workers/index.ts:889` | `console.error("Notification failed:", ...)` | `logger.error("notifications", "Notification failed", { error: e })` |
| `workers/index.ts:936` | `console.error("Rule webhook failed:", ...)` | `logger.error("rules", "Rule webhook failed", { error: e })` |
| `workers/index.ts:939` | `console.error("Rule evaluation failed:", ...)` | `logger.error("rules", "Rule evaluation failed", { error: e })` |
| `workers/index.ts:929` | `console.error("Embedding failed:", ...)` | `logger.error("vectorize", "Embedding failed", { error: e })` |
| `workers/index.ts:239` | `console.error("Follow-up reminder schedule failed:", ...)` | `logger.error("api", "Follow-up reminder schedule failed", { error: e })` |
| `workers/index.ts:152` | `console.error("Digest alarm update failed:", ...)` | `logger.error("api", "Digest alarm update failed", { error: e })` |
| `workers/lib/ai.ts:48` | `console.error("Prompt injection scanner failed...", ...)` | `logger.error("agent", "Prompt injection scanner failed", { error: e })` |
| `workers/lib/ai.ts:186` | `console.error("verifyDraft AI failed...", ...)` | `logger.error("agent", "verifyDraft AI failed", { error: e })` |
| `workers/lib/ai.ts:264` | `console.error("extractActionItems failed:", ...)` | `logger.error("triage", "Action item extraction failed", { error: e })` |
| `workers/lib/ai.ts:300` | `console.error("synthesizeDigest failed:", ...)` | `logger.error("agent", "Digest synthesis failed", { error: e })` |
| `workers/lib/ai.ts:365` | `console.error("triageEmail failed:", ...)` | `logger.error("triage", "Email triage failed", { error: e })` |
| `workers/lib/ai.ts:398` | `console.error("synthesizeAnswer failed:", ...)` | `logger.error("agent", "Answer synthesis failed", { error: e })` |
| `workers/lib/ai.ts:430` | `console.error("extractContactTopics failed:", ...)` | `logger.error("triage", "Contact topic extraction failed", { error: e })` |
| `workers/lib/ai.ts:468` | `console.error("summarizeThread failed:", ...)` | `logger.error("triage", "Thread summarization failed", { error: e })` |
| `workers/lib/notifications.ts:86,96` | `console.error("...notification failed:", ...)` | `logger.error("notifications", "...", { error: e })` |
| `workers/lib/notifications.ts:129,140` | `console.error("Reminder...failed:", ...)` | `logger.error("notifications", "...", { error: e })` |
| `workers/lib/vectorize.ts:28,78,93` | `console.error("embed/search/delete failed:", ...)` | `logger.error("vectorize", "...", { error: e })` |

**Total: ~25 console.error calls across 6 files** in `workers/` directory.

Note: `console.log` info-level messages (e.g., `workers/index.ts:791` "Ignoring email...") are left as-is or optionally converted to `logger.info`.

### Files NOT Modified
- `app/` frontend files -- browser console logs are fine as-is
- `workers/durableObject/index.ts` -- large file (1694 lines), defer to avoid conflicts; its errors are already caught by callers in `workers/index.ts`

## Implementation Steps

### Step 1: Create `workers/lib/logger.ts`
Thin structured logger wrapping console methods. Export `logger` object with `debug`, `info`, `warn`, `error` methods. Each method accepts `(component, message, options?)` where options has optional `error` and `meta` fields.

### Step 2: Update `workers/index.ts`
Replace ~12 `console.error` calls with logger calls. Add `import { logger } from "./lib/logger"`.

### Step 3: Update `workers/app.ts`
Replace 1 `console.error` call in email handler.

### Step 4: Update `workers/lib/ai.ts`
Replace ~8 `console.error` calls.

### Step 5: Update `workers/lib/notifications.ts`
Replace ~4 `console.error` calls.

### Step 6: Update `workers/lib/vectorize.ts`
Replace ~3 `console.error` calls.

### Step 7: Verify
Run `npm run typecheck` to confirm no type errors. Grep for remaining `console.error` in workers/ to confirm coverage.

## Todo List

- [ ] Create `workers/lib/logger.ts`
- [ ] Update `workers/index.ts` with logger imports and calls
- [ ] Update `workers/app.ts` with logger
- [ ] Update `workers/lib/ai.ts` with logger
- [ ] Update `workers/lib/notifications.ts` with logger
- [ ] Update `workers/lib/vectorize.ts` with logger
- [ ] Run typecheck
- [ ] Grep for remaining console.error in workers/ (expect 0 outside durableObject/)

## Success Criteria

1. `workers/lib/logger.ts` exists, <50 lines, zero external dependencies
2. All `console.error` in `workers/` (excluding `durableObject/`) use structured logger
3. Log output is valid JSON with `ts`, `level`, `component`, `msg` fields
4. `npm run typecheck` passes
5. Existing behavior unchanged -- logs still reach Cloudflare observability

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| JSON.stringify overhead on hot path (email receive) | Logger is called in catch blocks (error path), not hot path; <1ms |
| Breaking existing log queries | Structured JSON is strictly additive; raw message still in `msg` field |
| Missing a console.error call | Grep verification step catches stragglers |

## Security Considerations
- Logger must NOT log email bodies, passwords, or API tokens
- `meta` fields should contain IDs (emailId, mailboxId) not content
- Error stack traces are safe -- they contain code paths, not user data
