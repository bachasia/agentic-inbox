# WooCommerce Integration — Brainstorm Report

**Date:** 2026-06-03
**Status:** Approved — ready for planning

## Problem Statement

Display WooCommerce orders belonging to the email address being supported in the inbox. Support agents need customer order history (status, items, tracking) visible while handling email conversations.

## Requirements

- **Config**: per-mailbox WooCommerce credentials (store URL, consumer key, consumer secret)
- **UI**: orders in Contact Intelligence panel + Email panel sidebar
- **Data**: detailed — order #, status, total, date, line items, payment method, shipping, tracking
- **Tracking**: AST plugin (`_wc_shipment_tracking_items` meta) + ParcelPanel
- **Fetch**: cached in DO SQLite with 15-min TTL
- **Scope**: read-only
- **AI Agent**: `lookup_customer_orders` tool

## Architecture

```
Frontend → GET /api/v1/mailboxes/:id/woocommerce/orders?email=X → Hono API
  → MailboxDO.getWooOrders(email)
    → Cache hit (< 15min)? Return cached
    → Cache miss? → WooCommerce REST API v3 → store in SQLite → return
```

### WooCommerce Auth
- Consumer key + consumer secret via query params over HTTPS
- Credentials in DO settings JSON (same pattern as Telegram bot token)

### Cache Schema (DO SQLite)
```sql
CREATE TABLE woo_orders_cache (
  email TEXT PRIMARY KEY,
  data TEXT NOT NULL,      -- JSON array of orders
  fetched_at INTEGER NOT NULL
);
```

## Components (7 touchpoints)

| # | File | Change |
|---|------|--------|
| 1 | `app/types/index.ts` | Add `WooCommerceSettings`, `WooCommerceOrder` types to `MailboxSettings` |
| 2 | `workers/lib/woocommerce.ts` | **New** — WooCommerce REST API client |
| 3 | `workers/durableObject/index.ts` | Cache table migration + `getWooOrders()` method |
| 4 | `workers/index.ts` | API route `GET /mailboxes/:id/woocommerce/orders` |
| 5 | `workers/lib/tools.ts` | Agent tool `lookup_customer_orders` |
| 6 | `app/routes/settings.tsx` | WooCommerce config section |
| 7 | `app/components/woocommerce-orders-panel.tsx` | **New** — reusable orders panel |

## Order Display (Detailed + Tracking)

```
#1042 · Processing · $149.00
2026-06-01
 ├─ Widget Pro ×2
 └─ Cable Kit ×1
Payment: Stripe · Ship: Express
📦 GHN: ABCD1234 · In Transit
   Track: https://ghn.vn/...
```

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| WooCommerce API rate limits | 15-min cache, fetch only on UI request |
| Credentials exposure | Stored in DO settings, never sent to frontend |
| Large order history | Limit to latest 20 orders via `per_page` |
| Slow WooCommerce response | 10s timeout, show stale cache as fallback |
| Tracking data format varies | Parse `_wc_shipment_tracking_items` from order meta; graceful fallback if absent |

## Out of Scope

- Writing/updating orders
- WooCommerce webhooks → inbox
- Product catalog browsing
- Multi-store per mailbox
- Customer account management
