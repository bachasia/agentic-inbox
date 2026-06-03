---
phase: 6
title: "Testing and Polish"
status: pending
priority: P2
effort: "2h"
dependencies: [3, 5]
---

# Phase 6: Testing and Polish

## Overview

Write unit tests for the WooCommerce client and cache logic, verify typecheck passes, and evaluate settings.tsx for modularization (currently ~605 lines, adding ~50 more).

## Requirements

- Functional: test WooCommerce response parsing, cache TTL logic, tracking extraction
- Non-functional: all existing tests still pass, typecheck clean

## Related Code Files

- Create: `tests/unit/woocommerce-client.test.ts` — unit tests for `workers/lib/woocommerce.ts`
- Modify: `app/routes/settings.tsx` — evaluate modularization if over 200 lines per concern

## Implementation Steps

### 1. Unit tests for WooCommerce client

Test `fetchCustomerOrders` response parsing:
- Parse standard order response → correct `WooCommerceOrder` shape
- Extract `_wc_shipment_tracking_items` from `meta_data` → `tracking[]`
- Handle missing tracking meta gracefully → empty `tracking[]`
- Handle empty orders response → `[]`
- Handle WooCommerce error response → throws with error message
- Parse line items with quantity and total

Test `testWooCommerceConnection`:
- Successful connection → `{ success: true }`
- Invalid credentials → `{ success: false, error: "..." }`

Use `vi.fn()` to mock `fetch` for these tests.

### 2. Run full test suite

```bash
npm run test
npm run typecheck
```

Verify no regressions in existing tests.

### 3. Evaluate settings.tsx modularization

`settings.tsx` is currently ~605 lines. With WooCommerce it'll be ~660. Per project rules (200-line limit), consider extracting:
- WooCommerce section → `app/components/settings/woocommerce-settings-section.tsx`
- Notification section → `app/components/settings/notification-settings-section.tsx`

Only modularize if the file exceeds readability threshold after integration. Each section is self-contained (own state, own handlers), making extraction straightforward.

### 4. Final verification

- [ ] Dev server starts without errors
- [ ] Settings page renders WooCommerce section
- [ ] Orders panel renders in EmailPanel (with mock/real WooCommerce store)
- [ ] Agent tool responds to order queries

## Success Criteria

- [ ] Unit tests for WooCommerce client parsing pass
- [ ] Unit tests for tracking extraction pass
- [ ] `npm run test` — all tests pass (existing + new)
- [ ] `npm run typecheck` — clean
- [ ] Settings page modularization evaluated and applied if needed
- [ ] No console errors in dev server

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Mocking fetch in Vitest for CF Workers context | Use `vi.stubGlobal('fetch', mockFetch)` pattern matching existing test patterns |
| Can't test with real WooCommerce store in CI | Unit tests cover parsing logic; real store testing is manual |
