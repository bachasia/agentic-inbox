---
phase: 1
title: "Types and WooCommerce API Client"
status: completed
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Types and WooCommerce API Client

## Overview

Define TypeScript types for WooCommerce data and build a fetch-based API client that runs on Cloudflare Workers. The client handles auth, order fetching by email, and tracking data extraction from AST meta.

## Requirements

- Functional: fetch orders by customer email, parse line items + tracking, handle pagination
- Non-functional: 10s timeout, exponential backoff on 429, no Node.js APIs

## Related Code Files

- Modify: `app/types/index.ts` — add `WooCommerceSettings`, `WooCommerceOrder`, `WooCommerceLineItem`, `WooCommerceTracking`
- Create: `workers/lib/woocommerce.ts` — WooCommerce REST API client

## Implementation Steps

### 1. Add types to `app/types/index.ts`

```typescript
export interface WooCommerceSettings {
  enabled: boolean;
  storeUrl: string;       // e.g. "https://shop.example.com"
  consumerKey: string;
  consumerSecret: string;
}

export interface WooCommerceTracking {
  trackingNumber: string;
  trackingProvider: string;
  customTrackingProvider?: string;
  customTrackingLink?: string;
  dateShipped?: string;
}

export interface WooCommerceLineItem {
  name: string;
  quantity: number;
  total: string;          // WooCommerce returns string prices
}

export interface WooCommerceOrder {
  id: number;
  number: string;
  status: string;
  total: string;
  currency: string;
  dateCreated: string;
  paymentMethodTitle: string;
  shippingMethod?: string;
  lineItems: WooCommerceLineItem[];
  tracking: WooCommerceTracking[];
}
```

Add `woocommerce?: WooCommerceSettings` to `MailboxSettings` interface.

### 2. Create `workers/lib/woocommerce.ts`

Build a WooCommerce API client with:

```typescript
interface WooCommerceConfig {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

// Fetch orders by customer email
export async function fetchCustomerOrders(
  config: WooCommerceConfig,
  email: string,
  limit?: number,
): Promise<WooCommerceOrder[]>
```

Key implementation details:
- Auth: HTTP Basic Auth via `Authorization: Basic ${btoa(key:secret)}`
- Email filter strategy: try `customer_email={email}` param first; if returns empty/404, fallback to `search={email}` param
- Endpoint: `GET {storeUrl}/wp-json/wc/v3/orders?customer_email={email}&per_page={limit}&orderby=date&order=desc`
- Parse `line_items` array → `WooCommerceLineItem[]`
- Extract `_wc_shipment_tracking_items` from `meta_data` array → `WooCommerceTracking[]`
- Timeout: 10s via `AbortSignal.timeout(10_000)`
- Error handling: throw typed errors with WooCommerce error codes

**Note:** `email.sender` in the database is already a clean lowercase email address (extracted via `PostalMime.from.address` during ingestion). No additional email parsing needed on the frontend.

Add a test-connection function:
```typescript
export async function testWooCommerceConnection(
  config: WooCommerceConfig,
): Promise<{ success: boolean; error?: string }>
```
This calls `GET {storeUrl}/wp-json/wc/v3/system_status` to verify credentials work.

## Success Criteria

- [ ] `WooCommerceSettings` added to `MailboxSettings`
- [ ] `WooCommerceOrder`, `WooCommerceLineItem`, `WooCommerceTracking` types defined
- [ ] `fetchCustomerOrders()` fetches and parses orders from WooCommerce REST API v3
- [ ] Tracking data extracted from `_wc_shipment_tracking_items` meta
- [ ] `testWooCommerceConnection()` validates credentials
- [ ] 10s fetch timeout, proper error handling
- [ ] `npm run typecheck` passes

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| `search` param may not filter by billing email on all WooCommerce versions | Fallback: try `customer_email` param, then `search` param |
| Protected meta fields (`_` prefix) might not be returned | Test with real store; if blocked, fetch individual order with `?_fields=meta_data` |
