---
title: "WooCommerce Integration — Customer Orders in Inbox"
description: "Display WooCommerce orders for the customer email being supported. Per-mailbox config, cached in DO SQLite (15-min TTL), shown in ContactIntelligence + EmailPanel, with AI agent tool."
status: completed
priority: P1
branch: "main"
tags: [woocommerce, orders, integration, ecommerce, support]
blockedBy: []
blocks: []
created: "2026-06-03T03:37:45.240Z"
createdBy: "ck:plan"
source: skill
---

# WooCommerce Integration — Customer Orders in Inbox

## Overview

Display WooCommerce orders belonging to the email address being supported. Agents see order history (status, items, tracking) while handling email conversations. Read-only, per-mailbox WooCommerce credentials, cached with 15-min TTL, accessible from both UI panels and AI agent.

**Brainstorm report:** [brainstorm-260603-1019-woocommerce-integration-report.md](../reports/brainstorm-260603-1019-woocommerce-integration-report.md)
**API reference:** [researcher-260603-1035-woocommerce-api-reference-report.md](../reports/researcher-260603-1035-woocommerce-api-reference-report.md)

## Architecture

```
Frontend → GET /api/v1/mailboxes/:id/woocommerce/orders?email=X → Hono API
  → MailboxDO.getWooOrders(email)
    → Cache hit (< 15min)? Return cached
    → Cache miss? → WooCommerce REST API v3 → store in SQLite → return
```

## Phases

| Phase | Name | Status | Effort | Priority |
|-------|------|--------|--------|----------|
| 1 | [Types and WooCommerce API Client](./phase-01-types-and-woocommerce-api-client.md) | Completed | 2h | P1 |
| 2 | [Backend Cache and API Route](./phase-02-backend-cache-and-api-route.md) | Completed | 3h | P1 |
| 3 | [AI Agent Tool](./phase-03-ai-agent-tool.md) | Completed | 1h | P2 |
| 4 | [Settings UI](./phase-04-settings-ui.md) | Completed | 2h | P1 |
| 5 | [Orders Panel and Frontend Integration](./phase-05-orders-panel-and-frontend-integration.md) | Completed | 3h | P1 |
| 6 | [Testing and Polish](./phase-06-testing-and-polish.md) | Completed | 2h | P2 |

**Total estimated effort:** ~13h

## Dependencies

- No cross-plan blockers
- Requires a WooCommerce store with REST API keys (consumer key + secret with Read permission)
- AST or ParcelPanel plugin for tracking data
