---
phase: 1
title: "D1 + Better Auth Setup"
status: complete
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: D1 + Better Auth Setup

## Overview

Install Better Auth, create D1 database, configure auth server with admin plugin, generate schema migration, and wire D1 binding into wrangler.jsonc + Env types.

## Requirements

- Functional: Better Auth server config with email/password + admin plugin + D1 adapter
- Non-functional: Auth instance created per-request (edge runtime constraint); disable `cookieCache` (bug #4203 workaround)

## Architecture

```
wrangler.jsonc → D1 binding (AUTH_DB)
     ↓
workers/auth/server.ts → betterAuth({ database: drizzleAdapter(drizzle(env.AUTH_DB)) })
     ↓
D1 tables: user, session, account, verification (Better Auth core)
         + mailbox_permission, invite (custom)
```

## Related Code Files

- Modify: `wrangler.jsonc` — add `d1_databases` binding (both default + production)
- Modify: `workers/types.ts` — add `AUTH_DB: D1Database` to Env interface
- Modify: `package.json` — add `better-auth` dependency
- Create: `workers/auth/server.ts` — Better Auth server configuration
- Create: `workers/db/auth-schema.ts` — Drizzle schema for custom table (mailbox_permission)
- Create: `migrations/0001-auth-schema.sql` — D1 migration SQL for all auth tables (manual SQL, no CLI generate)

## Implementation Steps

1. **Install dependencies**
   ```bash
   npm install better-auth
   ```

2. **Create D1 database**
   ```bash
   npx wrangler d1 create auth-db
   npx wrangler d1 create auth-db-production
   ```

3. **Add D1 binding to `wrangler.jsonc`**
   Add `d1_databases` array at root level and in production env:
   ```jsonc
   "d1_databases": [
     { "binding": "AUTH_DB", "database_name": "auth-db", "database_id": "<id>" }
   ]
   ```

4. **Update `workers/types.ts`**
   Add `AUTH_DB: D1Database` to the Env interface. Remove `POLICY_AUD` and `TEAM_DOMAIN` (CF Access secrets no longer needed).

5. **Create `workers/auth/server.ts`**
   ```typescript
   import { betterAuth } from "better-auth";
   import { drizzleAdapter } from "better-auth/adapters/drizzle";
   import { drizzle } from "drizzle-orm/d1";
   import { admin } from "better-auth/plugins";
   import type { Env } from "../types";

   export function createAuth(env: Env) {
     return betterAuth({
       database: drizzleAdapter(drizzle(env.AUTH_DB)),
       secret: env.BETTER_AUTH_SECRET,
       baseURL: env.BETTER_AUTH_URL || "http://localhost:8787",
       emailAndPassword: { enabled: true },
       session: {
         expiresIn: 60 * 60 * 24 * 7, // 7 days
         updateAge: 60 * 60 * 24,       // refresh daily
         cookieCache: { enabled: false }, // bug #4203 workaround
       },
       plugins: [
         admin({
           defaultRole: "member",
         }),
       ],
     });
   }
   ```

6. **Create `workers/db/auth-schema.ts`** — Drizzle schema for custom table
   ```typescript
   // mailbox_permission: junction table userId ↔ mailboxId
   ```

7. **Create D1 migration SQL** — `migrations/0001-auth-schema.sql`
   Hand-written SQL (no CLI generate). Include Better Auth core tables (user, session, account, verification) + custom table (mailbox_permission). Apply with:
   ```bash
   npx wrangler d1 migrations apply auth-db --local
   ```

8. **Add env secrets** — `BETTER_AUTH_SECRET` (32+ char random string), `BETTER_AUTH_URL`
   ```bash
   npx wrangler secret put BETTER_AUTH_SECRET
   npx wrangler secret put BETTER_AUTH_URL
   ```

9. **Verify** — Run `npm run dev` and confirm D1 binding available, no type errors.

## Success Criteria

- [ ] D1 database created (local + remote)
- [ ] `wrangler.jsonc` has `d1_databases` binding in default and production
- [ ] `workers/types.ts` Env includes `AUTH_DB: D1Database`, `BETTER_AUTH_SECRET: string`, `BETTER_AUTH_URL: string`
- [ ] `workers/auth/server.ts` exports `createAuth(env)` without type errors
- [ ] D1 migration applied — tables user, session, account, verification, mailbox_permission exist
- [ ] `npm run dev` starts without errors

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| D1 cold start latency | Small tables, minimal impact; can add JWT stateless sessions later |
| Better Auth version breaking changes | Pin to `^1.6.13`, test before upgrading |
| `cookieCache` bug #4203 | Disabled by default; monitor GitHub issue |
