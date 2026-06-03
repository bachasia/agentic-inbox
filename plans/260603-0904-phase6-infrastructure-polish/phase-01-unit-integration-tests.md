# Phase 01: Unit & Integration Tests

## Context Links
- [Plan overview](./plan.md)
- [Vitest CF Workers pool docs](https://developers.cloudflare.com/workers/testing/vitest-integration/)
- Pure function targets: `workers/lib/rules-engine.ts`, `workers/lib/email-helpers.ts`, `shared/dates.ts`, `shared/folders.ts`, `app/lib/search-parser.ts`

## Overview
- **Priority:** P1 (highest -- blocks CI/CD)
- **Status:** pending
- **Effort:** 6h
- **Description:** Add Vitest with `@cloudflare/vitest-pool-workers` for Workers-compatible testing. Target 70%+ coverage on `workers/lib/` and `shared/`. Focus on pure functions first (highest testability, highest value), then API route integration tests.

## Key Insights
- Project has zero tests today -- no vitest, no jest, no test files anywhere
- `workers/lib/rules-engine.ts` is **pure** (no I/O, synchronous) -- perfect first target
- `workers/lib/email-helpers.ts` has pure functions (escapeHtml, stripHtmlToText, textToHtml, validateSender, generateMessageId, buildReferencesChain, buildThreadingHeaders) plus DO-dependent functions (getFullEmail, getFullThread, resolveOriginalEmail, listMailboxes)
- `shared/dates.ts` has 4 pure date formatters
- `shared/folders.ts` has constants + `getFolderDisplayName` pure function
- `app/lib/search-parser.ts` has `parseSearchQuery` and `isNaturalLanguage` -- pure parsing logic
- `workers/lib/ai.ts` has `normalizeDueDate` pure function, plus AI-dependent functions that need mocking
- `workers/lib/notifications.ts` has functions that call external APIs -- need fetch mocking
- `workers/lib/vectorize.ts` depends on Cloudflare bindings -- skip for unit tests

## Requirements

### Functional
- Vitest config that works with Cloudflare Workers runtime
- Unit tests for all pure functions in `workers/lib/`, `shared/`, `app/lib/`
- Integration tests for key API routes via miniflare (Vitest pool workers)
- Coverage reporting with 70%+ target on tested modules

### Non-Functional
- Tests run in <30s on CI
- No mocks/fakes for core logic -- test real behavior
- External API calls (AI, Telegram, Discord) can use fetch mocks since we can't call them in tests

## Architecture

### Test File Layout
```
tests/
  unit/
    rules-engine.test.ts          -- matchesCondition, evaluateRule, evaluateAllRules, isValidWebhookUrl
    email-helpers.test.ts         -- escapeHtml, stripHtmlToText, textToHtml, validateSender, generateMessageId, buildReferencesChain, buildThreadingHeaders, buildQuotedReplyBlock
    dates.test.ts                 -- formatListDate, formatDetailDate, formatShortDate, formatQuotedDate
    folders.test.ts               -- getFolderDisplayName, constants
    search-parser.test.ts         -- parseSearchQuery, isNaturalLanguage
    ai-utils.test.ts              -- normalizeDueDate
  integration/
    api-emails.test.ts            -- GET/POST/PUT/DELETE /api/v1/mailboxes/:id/emails
    api-mailboxes.test.ts         -- CRUD mailbox operations
```

### Vitest Config
```
vitest.config.ts                  -- new file at project root
```

### Data Flow
```
Test file → Vitest runner → @cloudflare/vitest-pool-workers → miniflare runtime
  ↓
Pure functions: direct import, no runtime needed
DO/API tests: miniflare provides DO stubs, R2, AI bindings
```

## Related Code Files

### Files to Read (test targets)
| File | Line Count | Pure Functions | Notes |
|------|-----------|----------------|-------|
| `workers/lib/rules-engine.ts` | 124 | matchesCondition, evaluateRule, evaluateAllRules, isValidWebhookUrl | 100% pure, no deps |
| `workers/lib/email-helpers.ts` | 267 | escapeHtml, stripHtmlToText, textToHtml, validateSender, generateMessageId, buildReferencesChain, buildThreadingHeaders, buildQuotedReplyBlock | Pure subset; DO-dependent functions skipped initially |
| `shared/dates.ts` | 107 | formatListDate, formatDetailDate, formatShortDate, formatQuotedDate | 100% pure |
| `shared/folders.ts` | 64 | getFolderDisplayName | Constants + 1 pure function |
| `app/lib/search-parser.ts` | 142 | parseSearchQuery, isNaturalLanguage | 100% pure |
| `workers/lib/ai.ts` | 470 | normalizeDueDate | 1 pure function; AI functions need mocking |

### Files to Create
| File | Purpose |
|------|---------|
| `vitest.config.ts` | Vitest configuration with CF workers pool |
| `tests/unit/rules-engine.test.ts` | Rules engine unit tests |
| `tests/unit/email-helpers.test.ts` | Email helpers unit tests |
| `tests/unit/dates.test.ts` | Date formatter unit tests |
| `tests/unit/folders.test.ts` | Folder constants unit tests |
| `tests/unit/search-parser.test.ts` | Search parser unit tests |
| `tests/unit/ai-utils.test.ts` | normalizeDueDate unit tests |

### Files to Modify
| File | Change |
|------|--------|
| `package.json` | Add vitest, @cloudflare/vitest-pool-workers devDeps; add `test`, `test:coverage` scripts |
| `tsconfig.json` | Add test tsconfig reference |

## Implementation Steps

### Step 1: Install dependencies
```bash
npm install -D vitest @cloudflare/vitest-pool-workers
```

### Step 2: Create `vitest.config.ts`
```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["workers/lib/**", "shared/**", "app/lib/**"],
      exclude: ["**/*.d.ts"],
    },
  },
});
```

### Step 3: Create `tsconfig.test.json`
Extends base config with test includes and vitest types.

### Step 4: Write unit tests (priority order)

**4a. `tests/unit/rules-engine.test.ts`** (~30 test cases)
- `matchesCondition`: test each operator (contains, equals, starts_with, ends_with, greater_than, less_than) with each field (from, to, subject, body, category, priority)
- `evaluateRule`: disabled rule returns [], empty conditions returns [], all-match returns actions, partial-match returns []
- `evaluateAllRules`: priority ordering, dedup (archive, mark_read, label by labelId), multiple rules
- `isValidWebhookUrl`: valid HTTPS, reject HTTP, reject localhost/127.0.0.1/::1, reject private IPs (10.x, 172.16-31.x, 192.168.x, 169.254.x), reject malformed URLs

**4b. `tests/unit/email-helpers.test.ts`** (~25 test cases)
- `escapeHtml`: escapes &, <, >, ", '; empty/null returns ""
- `stripHtmlToText`: strips tags, removes style/script blocks, normalizes whitespace
- `textToHtml`: preserves newlines as `<br>`, wraps in div with white-space:pre-wrap
- `validateSender`: valid match, case-insensitive match, mismatch throws SenderValidationError, invalid domain throws
- `generateMessageId`: returns UUID format, proper domain suffix
- `buildReferencesChain`: builds chain from existing refs, handles empty/malformed refs, sets threadId
- `buildThreadingHeaders`: In-Reply-To and References headers formatted with angle brackets
- `buildQuotedReplyBlock`: formats quoted block, escapes sender, strips HTML from body

**4c. `tests/unit/dates.test.ts`** (~12 test cases)
- `formatListDate`: today shows time, this year shows month+day, older shows year
- `formatDetailDate`: shows weekday+month+day+time
- `formatShortDate`: shows time only
- `formatQuotedDate`: full date with year, handles undefined/null/invalid

**4d. `tests/unit/folders.test.ts`** (~5 test cases)
- `Folders` constants match expected values
- `SYSTEM_FOLDER_IDS` has correct order, excludes spam
- `getFolderDisplayName`: known folders return display name, unknown folders capitalize first letter

**4e. `tests/unit/search-parser.test.ts`** (~15 test cases)
- `parseSearchQuery`: from:, to:, subject:, in:, is:unread/read/starred, has:attachment, before:, after:
- Quoted values: `from:"John Doe"`
- Free text extraction after operator removal
- Multiple operators combined
- `isNaturalLanguage`: multi-word without operators = true, single word = false, with operators = false

**4f. `tests/unit/ai-utils.test.ts`** (~6 test cases)
- `normalizeDueDate`: ISO date passthrough, parseable date strings, null/undefined returns null, unparseable returns null

### Step 5: Add npm scripts
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

### Step 6: Verify all tests pass
```bash
npm test
npm run test:coverage
```

## Todo List

- [ ] Install vitest + @cloudflare/vitest-pool-workers
- [ ] Create vitest.config.ts
- [ ] Create tsconfig.test.json
- [ ] Write rules-engine.test.ts
- [ ] Write email-helpers.test.ts
- [ ] Write dates.test.ts
- [ ] Write folders.test.ts
- [ ] Write search-parser.test.ts
- [ ] Write ai-utils.test.ts
- [ ] Add test/test:coverage scripts to package.json
- [ ] Verify 70%+ coverage on target modules
- [ ] Run typecheck to ensure no regressions

## Success Criteria

1. `npm test` exits 0 with all tests passing
2. `npm run test:coverage` shows 70%+ on `workers/lib/rules-engine.ts`, `workers/lib/email-helpers.ts`, `shared/dates.ts`, `shared/folders.ts`, `app/lib/search-parser.ts`
3. Tests run in <30s
4. No test uses mocks for core business logic -- only for external I/O (AI, fetch)

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| `@cloudflare/vitest-pool-workers` version incompatibility with wrangler 4.74 | Pin compatible versions; check CF docs for version matrix |
| Date formatters locale-dependent output | Use fixed locale in tests or match against regex patterns |
| `crypto.randomUUID()` not available in test runtime | Workers pool provides this; fallback to globalThis polyfill |

## Security Considerations
- Test files never import or reference secrets/credentials
- No test data contains real email addresses or PII
