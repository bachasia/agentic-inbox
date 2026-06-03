---
phase: 3
title: "Mailbox Permission Layer"
status: complete
priority: P1
effort: "2h"
dependencies: [2]
---

# Phase 3: Mailbox Permission Layer

## Overview

Add per-mailbox permission checks so Members only access assigned mailboxes while Admins access all. Filter mailbox listing on home page by user permissions. Protect mailbox CRUD (create/delete) as admin-only.

## Requirements

- Functional: Admin sees all mailboxes; Member sees only assigned mailboxes; mailbox create/delete requires admin
- Non-functional: Permission check adds minimal latency (single D1 query per request)

## Architecture

```
Request → requireAuth (Phase 2) → requireMailboxAccess (NEW) → mailbox route handler
                                         ↓
                                   D1: mailbox_permission
                                   admin? → skip check, allow all
                                   member? → SELECT WHERE userId=? AND mailboxId=?
```

## Related Code Files

- Modify: `workers/lib/mailbox.ts` — add permission check to `requireMailbox` middleware
- Modify: `workers/index.ts` — protect mailbox create/delete with `requireAdmin`; filter `GET /api/v1/mailboxes` by user permissions
- Create: `workers/auth/permissions.ts` — helper functions for D1 permission queries (getUserMailboxIds, hasMailboxAccess, assignMailbox, revokeMailbox)

## Implementation Steps

1. **Create `workers/auth/permissions.ts`**
   ```typescript
   import type { Env } from "../types";

   export async function getUserMailboxIds(env: Env, userId: string): Promise<string[]> {
     const result = await env.AUTH_DB.prepare(
       "SELECT mailboxId FROM mailbox_permission WHERE userId = ?"
     ).bind(userId).all();
     return result.results.map((r: any) => r.mailboxId);
   }

   export async function hasMailboxAccess(env: Env, userId: string, mailboxId: string): Promise<boolean> {
     const result = await env.AUTH_DB.prepare(
       "SELECT 1 FROM mailbox_permission WHERE userId = ? AND mailboxId = ?"
     ).bind(userId, mailboxId).first();
     return !!result;
   }

   export async function assignMailbox(env: Env, userId: string, mailboxId: string): Promise<void> {
     await env.AUTH_DB.prepare(
       "INSERT OR IGNORE INTO mailbox_permission (id, userId, mailboxId) VALUES (?, ?, ?)"
     ).bind(crypto.randomUUID(), userId, mailboxId).run();
   }

   export async function revokeMailbox(env: Env, userId: string, mailboxId: string): Promise<void> {
     await env.AUTH_DB.prepare(
       "DELETE FROM mailbox_permission WHERE userId = ? AND mailboxId = ?"
     ).bind(userId, mailboxId).run();
   }
   ```

2. **Update `workers/lib/mailbox.ts`** — add permission check after mailbox exists check:
   ```typescript
   // After verifying mailbox exists in R2 (line 29):
   const user = c.get("user");
   if (user.role !== "admin") {
     const allowed = await hasMailboxAccess(c.env, user.id, mailboxId);
     if (!allowed) return c.json({ error: "Forbidden" }, 403);
   }
   ```
   Update `MailboxContext` type to include user Variables from auth middleware.

3. **Update `workers/index.ts`** — filter mailbox listing:
   - `GET /api/v1/mailboxes`: if user.role === "admin", return all. If member, filter by `getUserMailboxIds()`.
   - `POST /api/v1/mailboxes`: add `requireAdmin` middleware (only admins create mailboxes)
   - `DELETE /api/v1/mailboxes/:mailboxId`: add `requireAdmin` middleware

4. **Update `app/routes/home.tsx`** — frontend already fetches from `GET /api/v1/mailboxes`, which now returns only permitted mailboxes. No frontend changes needed for filtering. Hide "New Mailbox" button for non-admin users.

5. **Add admin check to home page** — fetch current user role from session:
   ```typescript
   const { data: session } = authClient.useSession();
   const isAdmin = session?.user?.role === "admin";
   // Only show "New Mailbox" and delete buttons if isAdmin
   ```

## Success Criteria

- [ ] Member user can only access mailboxes assigned to them via `mailbox_permission`
- [ ] Member gets 403 when accessing unassigned mailbox
- [ ] Admin can access all mailboxes without permission entries
- [ ] `GET /api/v1/mailboxes` returns only permitted mailboxes for members
- [ ] Mailbox create/delete requires admin role
- [ ] Home page hides create/delete UI for non-admin users
- [ ] Permission check adds <50ms to request latency

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Extra D1 query per mailbox request | Single indexed query on (userId, mailboxId), fast |
| Admin auto-assigns on mailbox create | Auto-assign in Phase 4 when inviting; admin doesn't need permission entries |
| MCP/Agent endpoints bypass auth | MCP endpoints need separate handling in Phase 5 |
