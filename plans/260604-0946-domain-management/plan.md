---
title: "Domain Management UI"
description: "Allow admins to add/remove domains via UI without redeploying. Domains persisted in D1, merged with DOMAINS env var at runtime."
status: pending
priority: P2
branch: "main"
tags: ["admin", "domains", "d1"]
blockedBy: []
blocks: []
created: "2026-06-04T02:49:24.934Z"
createdBy: "ck:plan"
source: skill
---

# Domain Management UI

## Overview

Admins can add and remove domains from the `/domains` page without touching `wrangler.jsonc` or redeploying. New domains are persisted in a `custom_domains` D1 table. At runtime, backend merges env var domains (`env` — read-only) with D1 domains (`custom` — deletable).

Email routing for new domains still requires manual Cloudflare dashboard setup — out of scope.

## Phases

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| 1 | [D1 Migration](./phase-01-d1-migration.md) | Pending | 30m |
| 2 | [Backend CRUD API](./phase-02-backend-crud-api.md) | Pending | 1h |
| 3 | [Frontend UI](./phase-03-frontend-ui.md) | Pending | 1h |

## Key Design Decisions

- **Env var domains** (`DOMAINS` env) are immutable from UI — tagged `env`, no delete
- **D1 domains** are admin-managed — tagged `custom`, deletable
- `/api/v1/config` enriched: `domains` becomes `{ domain, source: "env"|"custom" }[]`
- Validation: lowercase, no protocol, no trailing slash, no duplicates
- Only `admin` role can add/delete

## Files Touched

| File | Change |
|------|--------|
| `migrations/0002-custom-domains.sql` | New migration |
| `workers/index.ts` | Update `/api/v1/config` to merge env + D1 |
| `workers/routes/admin-routes.ts` | Add `POST /admin/domains`, `DELETE /admin/domains/:domain` |
| `app/services/api.ts` | Add `addDomain`, `deleteDomain` API calls |
| `app/routes/domains.tsx` | Add domain form dialog, delete button, source badges |
| `app/types/index.ts` | Update `DomainInfo` type |

## Dependencies

None.
