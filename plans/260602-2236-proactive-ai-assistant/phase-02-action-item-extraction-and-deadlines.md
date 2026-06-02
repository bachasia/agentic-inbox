# Phase 4.2: Action Item Extraction & Deadlines

**Priority:** High
**Status:** Pending
**Depends on:** Phase 4.1 (action_items table + DO methods)

## Context Links

- [receiveEmail pipeline](../../workers/index.ts)
- [AI utilities](../../workers/lib/ai.ts)
- [DO methods](../../workers/durableObject/index.ts)
- [API routes](../../workers/index.ts)
- [Action items query](../../app/queries/) (new file)

## Overview

On every inbound email, run an AI extraction pass that identifies action items and deadlines embedded in the message body. Store structured results in `action_items`. Expose a list API. Wire a new agent tool so kimi-k2.5 can answer "what do I need to do?".

## Key Insights

- Runs in the same `waitUntil()` pattern as triage — does not block email receipt
- Deadline detection is part of extraction, not a separate call: one structured output returns `[{ description, dueDate }]`
- Only extract from emails in `to` field (user is directly addressed) — skip newsletters, notifications per triage category
- Relative dates ("next Friday", "by EOD") normalized to ISO date via simple JS date math after AI extraction
- Agent tool `getActionItems` reuses `listActionItems()` DO method — no new backend logic

## Requirements

### Functional
- `extractActionItems()` AI function in `workers/lib/ai.ts` — returns array of `{ description, dueDate? }`
- Wire extraction into `receiveEmail()` pipeline (skip if category = newsletter/notification/spam)
- API endpoint `GET /api/v1/mailboxes/:id/action-items` — list pending action items with source email info
- API endpoint `PATCH /api/v1/mailboxes/:id/action-items/:itemId` — mark complete / update
- API endpoint `DELETE /api/v1/mailboxes/:id/action-items/:itemId`
- New agent tool `getActionItems` callable from kimi-k2.5 chat
- Frontend: action items visible on email detail panel (chips under subject)

### Non-functional
- Extraction runs async — does not add latency to email receive
- Skip extraction when email has no actionable content (return empty array → no DB writes)
- Max 1000 chars of email body sent to extraction prompt

## Architecture

```
extractActionItems(ai, { subject, body, sender }) → ActionItemResult[]
  ├─ Truncate body to 1000 chars (plaintext)
  ├─ System prompt: "Extract all tasks, requests, or commitments. For each, give a short description and optional ISO due date. Return JSON array."
  ├─ Parse + validate response (array of { description: string, dueDate?: string })
  └─ Return [] on failure (fail-open)

receiveEmail() updated:
  ...triage (phase 3.2)...
  ctx.waitUntil((async () => {
    if (triage?.category in ["newsletter","notification","spam"]) return;
    const items = await extractActionItems(ai, { subject, body, sender });
    for (const item of items) {
      await stub.createActionItem({ emailId, description: item.description, dueDate: item.dueDate });
    }
  })());

Agent tool: getActionItems
  input: { pendingOnly?: boolean }
  output: ActionItem[]  (calls stub.listActionItems())
```

### Date Normalization

AI returns dates as free-form text ("next Friday", "June 15", "EOD tomorrow"). Post-process with a small `normalizeDueDate(raw: string): string | null` helper:
- ISO date strings → pass through
- Relative expressions → resolve against `new Date()` in the Worker
- Unparseable → null (store without due date)

## Related Code Files

### Modify
- `workers/lib/ai.ts` — add `extractActionItems()` function
- `workers/index.ts` — wire extraction into `receiveEmail()`, add 3 action items API endpoints, register agent tool
- `workers/durableObject/index.ts` — no changes needed (CRUD from phase 4.1)

### Create
- `app/queries/action-items-query.ts` — `useActionItems(mailboxId)` TanStack Query hook
- (no new route files — action items shown inline on email detail panel)

## Implementation Steps

1. **`extractActionItems()` in `workers/lib/ai.ts`**:
   - Input: `ai: Ai`, `{ subject: string, body: string, sender: string }`
   - Prompt: structured output requesting JSON array of `{ description, dueDate? }`
   - Parse response array, validate each entry has non-empty `description`
   - Add `normalizeDueDate(raw)` helper in same file
   - Return `[]` on any failure

2. **Wire into `receiveEmail()`** in `workers/index.ts`:
   - After triage `waitUntil` block, add separate `waitUntil` for extraction
   - Skip if `triage?.category` is `"newsletter"`, `"notification"`, or `"spam"`
   - Loop extracted items → `stub.createActionItem()`

3. **API endpoints** in `workers/index.ts`:
   - `GET /api/v1/mailboxes/:mailboxId/action-items?pending=true` → `stub.listActionItems()`
   - `PATCH /api/v1/mailboxes/:mailboxId/action-items/:itemId` with `{ completed: true }` → `stub.completeActionItem()`
   - `DELETE /api/v1/mailboxes/:mailboxId/action-items/:itemId` → `stub.deleteActionItem()`

4. **Agent tool registration** in `workers/index.ts` (in the tools array for kimi-k2.5):
   ```ts
   {
     name: "getActionItems",
     description: "List pending action items extracted from emails. Use to answer 'what do I need to do?' questions.",
     input_schema: { type: "object", properties: { pendingOnly: { type: "boolean" } } },
   }
   // handler: call stub.listActionItems({ pendingOnly: input.pendingOnly ?? true })
   ```

5. **Frontend query** `app/queries/action-items-query.ts`:
   - `useActionItems(mailboxId, pendingOnly?)` — GET hook with `queryKey: [keys.actionItems, mailboxId]`
   - Add `keys.actionItems` to `app/queries/keys.ts`

6. **Email detail panel** — add action items section below email body:
   - Show chips per action item: description + due date badge if present
   - Checkbox to mark complete (calls PATCH)
   - Only show section if `actionItems.length > 0`

## Todo List

- [ ] Implement `extractActionItems()` AI function with `normalizeDueDate()` helper
- [ ] Wire extraction into `receiveEmail()` pipeline (skip categories)
- [ ] Add `GET /action-items` API endpoint
- [ ] Add `PATCH /action-items/:id` complete endpoint
- [ ] Add `DELETE /action-items/:id` endpoint
- [ ] Register `getActionItems` agent tool in kimi-k2.5 tools array
- [ ] Add `useActionItems` TanStack Query hook
- [ ] Add action items chips to email detail panel
- [ ] Verify build compiles

## Success Criteria

- Receiving an email with "Can you send me the report by Friday?" creates an action item with due date
- Newsletters produce zero action items
- Agent can list pending action items when asked "what do I need to do?"
- Email detail panel shows action items for relevant emails
- Marking complete via UI updates DB

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| AI extracts trivial items ("Let me know if you have questions") | Noise in action items | Prompt instructs: extract only explicit tasks/requests/commitments, not pleasantries |
| Relative date parsing wrong timezone | Due date off by a day | Normalize to date-only ISO string (no time component) to avoid tz edge cases |
| High extraction rate on all emails | Many low-quality items | Skip newsletter/notification/spam (triage gate) + confidence gate in prompt |

## Security Considerations

- Extraction prompt includes email body — Workers AI only, no external calls
- Action items API endpoints require same Cloudflare Access JWT as all other `/api/v1/` routes
