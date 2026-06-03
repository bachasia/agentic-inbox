---
phase: 2
title: "Backend Cache and API Route"
status: completed
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Backend Cache and API Route

## Overview

Add a SQLite cache table in the Durable Object for WooCommerce orders, implement cache-through logic with 15-min TTL, and expose a Hono API route for the frontend.

## Requirements

- Functional: cache orders per email in DO SQLite, serve from cache when fresh, fetch from WooCommerce on miss
- Non-functional: 15-min TTL, graceful fallback to stale cache on WooCommerce errors, max 20 orders

## Related Code Files

- Modify: `workers/durableObject/migrations.ts` — add migration `19_add_woocommerce_cache`
- Modify: `workers/durableObject/index.ts` — add `getWooOrders()` method
- Modify: `workers/index.ts` — add API route `GET /api/v1/mailboxes/:mailboxId/woocommerce/orders`

## Implementation Steps

### 1. Add migration in `workers/durableObject/migrations.ts`

Append to `mailboxMigrations` array:

```typescript
{
  name: "19_add_woocommerce_cache",
  sql: txn(`
    CREATE TABLE woo_orders_cache (
      email TEXT NOT NULL PRIMARY KEY,
      data TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    );
  `),
},
```

### 2. Add `getWooOrders()` to MailboxDO in `workers/durableObject/index.ts`

```typescript
async getWooOrders(email: string): Promise<WooCommerceOrder[]>
```

Logic:
1. Read `woo_orders_cache` for this email
2. If `fetched_at` is within 15 minutes (`Date.now() - fetched_at < 900_000`), return cached `data` (JSON parsed)
3. If cache miss or stale:
   a. Read mailbox settings from R2 to get `woocommerce` config
   b. If WooCommerce not configured, return `[]`
   c. Call `fetchCustomerOrders(config, email, 20)` from `workers/lib/woocommerce.ts`
   d. Upsert into `woo_orders_cache`: `INSERT OR REPLACE INTO woo_orders_cache (email, data, fetched_at) VALUES (?, ?, ?)`
   e. Return orders
4. On fetch error: if stale cache exists, return stale data (log warning); if no cache, throw

### 3. Add API route in `workers/index.ts`

```typescript
// WooCommerce orders
app.get("/api/v1/mailboxes/:mailboxId/woocommerce/orders", requireMailbox, async (c: AppContext) => {
  const email = c.req.query("email");
  if (!email) return c.json({ error: "email query param required" }, 400);

  const stub = c.get("mailboxStub");
  const orders = await (stub as any).getWooOrders(email.toLowerCase());
  return c.json({ orders });
});
```

Also add a test-connection endpoint:

```typescript
app.post("/api/v1/mailboxes/:mailboxId/woocommerce/test", requireMailbox, async (c: AppContext) => {
  const body = await c.req.json();
  const result = await testWooCommerceConnection({
    storeUrl: body.storeUrl,
    consumerKey: body.consumerKey,
    consumerSecret: body.consumerSecret,
  });
  return c.json(result);
});
```

## Success Criteria

- [ ] Migration `19_add_woocommerce_cache` creates `woo_orders_cache` table
- [ ] `getWooOrders(email)` returns cached data when fresh (< 15 min)
- [ ] `getWooOrders(email)` fetches from WooCommerce API on cache miss
- [ ] Stale cache served as fallback when WooCommerce API errors
- [ ] `GET /api/v1/mailboxes/:id/woocommerce/orders?email=X` returns orders JSON
- [ ] `POST /api/v1/mailboxes/:id/woocommerce/test` validates WooCommerce credentials
- [ ] `npm run typecheck` passes

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| DO method not exposed on stub type | Use `(stub as any).getWooOrders()` cast, matching existing ContactIntelligence pattern |
| SQLite transaction needed for upsert | Single `INSERT OR REPLACE` is atomic, no transaction needed |
| WooCommerce timeout blocks DO response | 10s timeout in client + stale cache fallback |
