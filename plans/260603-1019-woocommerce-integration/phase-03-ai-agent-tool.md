---
phase: 3
title: "AI Agent Tool"
status: completed
priority: P2
effort: "1h"
dependencies: [2]
---

# Phase 3: AI Agent Tool

## Overview

Add `lookup_customer_orders` tool to the AI agent so it can answer questions like "what are this customer's recent orders?" during email support conversations.

## Requirements

- Functional: agent can look up WooCommerce orders by customer email, returns formatted order summary
- Non-functional: uses same cached path as UI (no extra WooCommerce API calls)

## Related Code Files

- Modify: `workers/lib/tools.ts` — add `toolGetCustomerOrders()` function
- Modify: `workers/agent/index.ts` — register `lookup_customer_orders` tool + update system prompt
- Modify: `workers/mcp/index.ts` — register `lookup_customer_orders` MCP tool

## Implementation Steps

### 1. Add tool function in `workers/lib/tools.ts`

```typescript
export async function toolGetCustomerOrders(
  env: Env,
  mailboxId: string,
  params: { contactEmail: string },
) {
  const stub = getMailboxStub(env, mailboxId);
  const orders = await (stub as unknown as WooCommerceStub).getWooOrders(params.contactEmail);
  if (!orders || orders.length === 0) {
    return { message: `No WooCommerce orders found for ${params.contactEmail}` };
  }
  return { orders, count: orders.length };
}
```

Add type alias near top of file:
```typescript
type WooCommerceStub = {
  getWooOrders: (email: string) => Promise<unknown>;
};
```

### 2. Register tool in `workers/agent/index.ts`

In `createEmailTools()`, add after `get_contact_intelligence`:

```typescript
lookup_customer_orders: defineTool({
  description:
    "Look up WooCommerce orders for a customer by email address. Returns order history with status, items, total, payment method, and tracking info. Use when asked about a customer's purchases or order status.",
  parameters: z.object({
    contactEmail: z.string().email().describe("Customer email address to look up orders for"),
  }),
  execute: async ({ contactEmail }): Promise<unknown> => {
    return toolGetCustomerOrders(env, mailboxId, { contactEmail });
  },
}),
```

Import `toolGetCustomerOrders` from `../lib/tools`.

### 3. Update system prompt in `workers/agent/index.ts`

Add to `DEFAULT_SYSTEM_PROMPT` after the Contact Intelligence section:

```
## Customer Orders
Use **lookup_customer_orders** to look up WooCommerce orders for a contact. Use when asked "What did this customer order?", "What's their order status?", or "Show me their purchase history". Returns order numbers, statuses, line items, and tracking info.
```

### 4. Register MCP tool in `workers/mcp/index.ts`

Add after the `move_email` tool registration, following existing pattern:

```typescript
// ── lookup_customer_orders ─────────────────────────────────
this.server.tool(
  "lookup_customer_orders",
  "Look up WooCommerce orders for a customer by email address. Returns order history with status, items, total, payment method, and tracking info.",
  {
    mailboxId: z.string().describe("The mailbox email address"),
    contactEmail: z.string().describe("Customer email address to look up orders for"),
  },
  async ({ mailboxId, contactEmail }) => {
    const denied = await verifyMailbox(mailboxId);
    if (denied) return denied;
    const result = await toolGetCustomerOrders(env, mailboxId, { contactEmail });
    return mcpText(result);
  },
);
```

Import `toolGetCustomerOrders` from `../lib/tools`.

## Success Criteria

- [ ] `toolGetCustomerOrders()` function added to `workers/lib/tools.ts`
- [ ] `lookup_customer_orders` tool registered in agent with proper z.object schema
- [ ] `lookup_customer_orders` tool registered in MCP server
- [ ] System prompt updated with Customer Orders section
- [ ] Agent can answer "what are the orders for user@example.com?"
- [ ] MCP clients can call `lookup_customer_orders` tool
- [ ] `npm run typecheck` passes

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| WooCommerce not configured for mailbox | `getWooOrders()` returns `[]` when no config — tool returns "no orders found" message |
| Agent overuses tool | Description scoped to explicit order/purchase questions only |
