---
phase: 2
title: "Auth Middleware + Login"
status: complete
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Auth Middleware + Login

## Overview

Replace CF Access JWT middleware with Better Auth session middleware, mount auth handler on Hono, create login page + first-time setup page, and add auth client for React frontend.

## Requirements

- Functional: Login/logout via email+password, first-user auto-admin setup, session cookie auth on all API routes
- Non-functional: Dev mode bypass preserved, unauthenticated users redirected to /login

## Architecture

```
workers/app.ts middleware chain:
  1. /api/auth/* → Better Auth handler (login, signup, session)
  2. * → Session middleware (validate cookie, inject user into context)
  3. /api/* → Protected routes (401 if no session)
  4. /setup, /login → Public React routes (no auth required)

Frontend:
  app/lib/auth-client.ts → createAuthClient({ baseURL: same-origin })
  app/routes/login.tsx → email/password form
  app/routes/setup.tsx → first admin creation (only when 0 users)
```

## Related Code Files

- Modify: `workers/app.ts` — replace CF Access middleware (lines 47-83) with Better Auth handler + session middleware
- Modify: `app/routes.ts` — add `/login` and `/setup` routes
- Modify: `app/root.tsx` — add auth context provider, redirect unauthenticated to /login
- Create: `app/lib/auth-client.ts` — Better Auth React client
- Create: `app/routes/login.tsx` — login page
- Create: `app/routes/setup.tsx` — first-time admin setup page
- Create: `workers/auth/middleware.ts` — session validation middleware + admin guard

## Implementation Steps

1. **Create `workers/auth/middleware.ts`**
   ```typescript
   import { createMiddleware } from "hono/factory";
   import { createAuth } from "./server";
   import type { Env } from "../types";

   // Session middleware — validates cookie, injects user into context
   export const requireAuth = createMiddleware<{
     Bindings: Env;
     Variables: { user: { id: string; email: string; role: string; name: string } };
   }>(async (c, next) => {
     if (import.meta.env.DEV) {
       c.set("user", { id: "dev", email: "dev@localhost", role: "admin", name: "Dev" });
       return next();
     }
     const auth = createAuth(c.env);
     const session = await auth.api.getSession({ headers: c.req.raw.headers });
     if (!session) return c.json({ error: "Unauthorized" }, 401);
     c.set("user", session.user);
     await next();
   });

   // Admin-only guard — use after requireAuth
   export const requireAdmin = createMiddleware(async (c, next) => {
     const user = c.get("user");
     if (user?.role !== "admin") return c.json({ error: "Forbidden" }, 403);
     await next();
   });
   ```

2. **Update `workers/app.ts`**
   - Remove `jose` import and CF Access JWT validation (lines 7, 32-83)
   - Mount Better Auth handler before API routes:
     ```typescript
     app.on(["POST", "GET"], "/api/auth/*", async (c) => {
       const auth = createAuth(c.env);
       return auth.handler(c.req.raw);
     });
     ```
   - Mount **public** endpoints BEFORE `requireAuth` (setup-status needs to be accessible without session):
     ```typescript
     // Public: setup status check (unauthenticated users need this)
     app.get("/api/v1/auth/setup-status", async (c) => {
       const result = await c.env.AUTH_DB.prepare("SELECT COUNT(*) as count FROM user").first();
       return c.json({ needsSetup: (result?.count ?? 0) === 0 });
     });
     // Public: config endpoint (needed before login for domain info)
     // ... existing /api/v1/config stays before requireAuth
     ```
   - Add session middleware AFTER public endpoints:
     ```typescript
     app.use("/api/v1/*", requireAuth);
     ```

3. **Create `app/lib/auth-client.ts`**
   ```typescript
   import { createAuthClient } from "better-auth/react";
   export const authClient = createAuthClient();
   // Same-origin: no baseURL needed, auto-detects /api/auth
   ```

4. **Create `app/routes/login.tsx`**
   - Email + password form using `@cloudflare/kumo` components (match existing UI)
   - Call `authClient.signIn.email({ email, password })` on submit
   - On success redirect to `/`
   - Show error messages on failure
   - Link to setup page if no users exist

5. **Create `app/routes/setup.tsx`**
   - Check `/api/v1/auth/setup-status` — if `needsSetup: false`, redirect to `/login`
   - Form: name, email, password, confirm password
   - Call `authClient.signUp.email({ email, password, name })`
   - **Custom logic**: after signup, backend checks user count — if this is user #1, call `auth.api.setRole(userId, 'admin')` to auto-promote to admin
   - On success redirect to `/`

6. **Update `app/routes.ts`** — add routes:
   ```typescript
   route("login", "routes/login.tsx"),
   route("setup", "routes/setup.tsx"),
   ```

7. **Update `app/root.tsx`** — add auth gate:
   - Use `authClient.useSession()` in root layout
   - If no session and route is not `/login` or `/setup`, redirect to `/login`
   - Pass user context down via React context or props

8. **Remove CF Access references**
   - `workers/app.ts`: remove `jose` imports, `getAccessUrls()`, CF Access middleware
   - `workers/types.ts`: remove `POLICY_AUD`, `TEAM_DOMAIN` from Env (already done in Phase 1)
   - `README.md`: update auth setup instructions

## Success Criteria

- [ ] `/login` page renders with email/password form
- [ ] `/setup` page only accessible when 0 users in DB
- [ ] First user signup via `/setup` creates admin account
- [ ] Login sets httpOnly session cookie
- [ ] All `/api/v1/*` routes return 401 without valid session
- [ ] `/api/auth/*` routes work without auth (public)
- [ ] Dev mode bypasses auth (existing behavior preserved)
- [ ] Logout clears session cookie

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Breaking existing deployments | README migration guide; /setup handles first admin |
| Session cookie not sent cross-origin | Same-origin app, no issue; CORS already configured |
| Better Auth handler conflicts with Hono routes | Mount `/api/auth/*` before other routes |
