# Phase 5.4: Rules & Filters Automation

**Priority:** Medium
**Status:** Pending
**Depends on:** Phase 3 triage columns (category, priority), Phase 2 labels, existing alarm infrastructure

## Context Links

- [receiveEmail() pipeline](../../workers/index.ts) — where rules evaluate
- [Labels system](../../workers/durableObject/index.ts) — `addLabelToEmail()`, `getLabelByName()`
- [Notifications](../../workers/lib/notifications.ts) — Telegram/Discord helpers
- [Settings page](../../app/routes/settings.tsx) — where rule builder UI goes
- [Mailbox settings R2](../../workers/index.ts) — settings JSON in R2

## Overview

Add an if/then rules engine for automatic email processing. Users define conditions (sender, subject, category, priority) and actions (label, move, archive, notify, webhook). Rules evaluate on every inbound email after triage, before notifications.

## Key Insights

- Rules are simple condition-action pairs, not a complex workflow engine. No branching, no loops, no variables. KISS.
- Store rules in the `automation_rules` DO SQLite table (not R2 JSON) — need atomic ordering, enable/disable, and audit trail.
- Evaluate rules in priority order. First matching rule wins (or "apply all" mode — configurable per rule). Default: apply all matching.
- Conditions are AND-joined within a rule. Multiple rules are evaluated independently.
- Actions execute synchronously within `receiveEmail()` pipeline — they modify the email record before notification/auto-draft.
- Max 50 rules per mailbox to prevent runaway evaluation.

## Requirements

### Functional
- Migration 18: `automation_rules` table
- DO CRUD: `createRule()`, `listRules()`, `updateRule()`, `deleteRule()`, `reorderRules()`
- Rule evaluation function: `evaluateRules(email, rules)` → list of actions to execute
- Actions: `label`, `move_to_folder`, `archive`, `mark_read`, `notify` (Telegram/Discord with custom message), `webhook` (POST to URL)
- API endpoints: CRUD for rules
- Frontend: rule builder UI in settings page — condition selectors + action pickers + drag-to-reorder
- Rules evaluate in `receiveEmail()` after triage, before notification

### Non-functional
- Rule evaluation < 10ms for 50 rules (simple string matching)
- Rule creation validates conditions and actions (no invalid folder IDs, no empty conditions)
- Disabled rules skipped during evaluation

## Architecture

```
automation_rules table:
  id          TEXT PRIMARY KEY
  name        TEXT NOT NULL
  enabled     INTEGER DEFAULT 1
  priority    INTEGER DEFAULT 0     -- lower = evaluate first
  conditions  TEXT NOT NULL          -- JSON: [{ field, operator, value }]
  actions     TEXT NOT NULL          -- JSON: [{ type, params }]
  created_at  TEXT NOT NULL
  updated_at  TEXT NOT NULL

Condition schema:
  { field: "from" | "to" | "subject" | "body" | "category" | "priority",
    operator: "contains" | "equals" | "starts_with" | "ends_with" | "greater_than" | "less_than",
    value: string }

Action schema:
  { type: "label", params: { labelId: string } }
  { type: "move", params: { folder: string } }
  { type: "archive" }
  { type: "mark_read" }
  { type: "notify", params: { message: string } }   -- uses existing Telegram/Discord
  { type: "webhook", params: { url: string } }

Evaluation flow in receiveEmail():
  ...triage complete...
  → rules = DO.listRules(enabledOnly: true, orderByPriority)
  → matchedActions = evaluateRules(email, rules)
  → for each action: execute(action, email, DO, env)
  → continue with notifications, auto-draft...
```

## Related Code Files

### Modify
- `workers/durableObject/migrations.ts` — migration 18
- `workers/db/schema.ts` — add `automationRules` table
- `workers/durableObject/index.ts` — add rule CRUD methods + `evaluateAndApplyRules()`
- `workers/index.ts` — add rules API endpoints + integrate into receiveEmail()
- `app/services/api.ts` — add rules API calls
- `app/types/index.ts` — add Rule, RuleCondition, RuleAction types
- `app/routes/settings.tsx` — add rules section with builder UI

### Create
- `workers/lib/rules-engine.ts` — evaluation logic (pure function, testable)
- `app/components/RuleBuilder.tsx` — condition/action builder component
- `app/queries/rules.ts` — React Query hooks for rules CRUD

## Implementation Steps

1. **Migration 18** in `workers/durableObject/migrations.ts`:
   ```sql
   CREATE TABLE automation_rules (
     id         TEXT NOT NULL PRIMARY KEY,
     name       TEXT NOT NULL,
     enabled    INTEGER NOT NULL DEFAULT 1,
     priority   INTEGER NOT NULL DEFAULT 0,
     conditions TEXT NOT NULL,
     actions    TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX idx_rules_priority ON automation_rules(priority) WHERE enabled = 1;
   ```

2. **Drizzle schema** — add `automationRules` table

3. **Frontend types** in `app/types/index.ts`:
   ```ts
   export interface RuleCondition {
     field: 'from' | 'to' | 'subject' | 'body' | 'category' | 'priority';
     operator: 'contains' | 'equals' | 'starts_with' | 'ends_with' | 'greater_than' | 'less_than';
     value: string;
   }
   export interface RuleAction {
     type: 'label' | 'move' | 'archive' | 'mark_read' | 'notify' | 'webhook';
     params?: Record<string, string>;
   }
   export interface AutomationRule {
     id: string;
     name: string;
     enabled: boolean;
     priority: number;
     conditions: RuleCondition[];
     actions: RuleAction[];
     createdAt: string;
     updatedAt: string;
   }
   ```

4. **`workers/lib/rules-engine.ts`** — pure evaluation logic:
   - `matchesCondition(email, condition)` — string matching per field/operator
   - `evaluateRule(email, rule)` — AND all conditions, return actions if match
   - `evaluateAllRules(email, rules)` — iterate rules in priority order, collect all matched actions
   - Deduplicate actions (don't label twice with same labelId)

5. **DO CRUD methods**:
   - `createRule(rule)` — INSERT with nanoid, validate conditions/actions
   - `listRules(enabledOnly?)` — SELECT ordered by priority
   - `updateRule(id, updates)` — UPDATE + set updated_at
   - `deleteRule(id)` — DELETE
   - `reorderRules(ids: string[])` — bulk UPDATE priority based on array index

6. **`evaluateAndApplyRules(emailId)`** DO method:
   - Fetch email + rules
   - Call `evaluateAllRules(email, rules)`
   - Execute each action: `addLabelToEmail()`, `moveEmail()`, `markRead()`, `sendNotification()`, `fetch(webhookUrl, { method: 'POST', body: payload })`
   - Return list of applied actions for logging

7. **Integration into `receiveEmail()`**:
   - After triage (step 3), before notification (step 8):
   ```ts
   const appliedActions = await mailboxDO.evaluateAndApplyRules(emailId);
   ```

8. **API endpoints**:
   - `GET /api/v1/mailboxes/:id/rules` — list all rules
   - `POST /api/v1/mailboxes/:id/rules` — create rule
   - `PUT /api/v1/mailboxes/:id/rules/:ruleId` — update rule
   - `DELETE /api/v1/mailboxes/:id/rules/:ruleId` — delete rule
   - `PUT /api/v1/mailboxes/:id/rules/reorder` — reorder rules

9. **Frontend**:
   - `app/queries/rules.ts` — hooks for CRUD operations
   - `app/components/RuleBuilder.tsx` — form with condition rows (field dropdown, operator dropdown, value input) + action rows (type dropdown, params). Add/remove rows. Preview match description.
   - `app/routes/settings.tsx` — add "Automation Rules" section with rule list + create/edit modal + drag-to-reorder

## Todo List

- [ ] Add migration 18 (automation_rules table)
- [ ] Add automationRules to Drizzle schema
- [ ] Add Rule types to frontend
- [ ] Create `workers/lib/rules-engine.ts` evaluation logic
- [ ] Implement DO CRUD methods for rules
- [ ] Implement `evaluateAndApplyRules()` DO method
- [ ] Integrate rule evaluation into receiveEmail() pipeline
- [ ] Add rules API endpoints
- [ ] Add rules API service methods in frontend
- [ ] Create React Query hooks for rules
- [ ] Create RuleBuilder component
- [ ] Add rules section to settings page
- [ ] Verify build compiles

## Success Criteria

- Rule "If from contains newsletter@, archive" auto-archives matching inbound emails
- Rule "If category equals business AND priority >= 3, notify via Telegram" sends notification
- Rules evaluate in < 10ms for 50 rules
- Rule builder UI allows creating, editing, reordering, enabling/disabling rules
- No regression on existing email receive pipeline when no rules defined

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Webhook action blocks receiveEmail() on slow external URL | Delayed email processing | Fire webhooks via `waitUntil()` — non-blocking |
| Rule with "move to spam" + "notify" creates confusing UX | User confused by spam notification | Document behavior: actions apply in order. Move happens, then notify. |
| Malicious webhook URL (SSRF) | Security risk | Validate URL: must be HTTPS, no internal IPs, no localhost. Rate limit webhook calls. |
| Circular rules (move to inbox triggers re-evaluation) | Infinite loop | Rules only evaluate once per inbound email in `receiveEmail()`. No re-evaluation on move. |

## Security Considerations

- Webhook URLs must be validated: HTTPS only, no internal/private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x)
- Webhook payloads contain email metadata (sender, subject, date) — not full body by default
- Rule conditions are stored as JSON, not executable code — no injection risk
- Max 50 rules enforced server-side to prevent DoS via evaluation
