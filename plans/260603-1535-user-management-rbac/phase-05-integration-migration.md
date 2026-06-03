---
phase: 5
title: "Integration + Migration"
status: complete
priority: P1
effort: "2h"
dependencies: [4]
---

# Phase 5: Integration + Migration

## Overview

Secure remaining endpoints (MCP, Agent WebSocket, email inbound), update README with new auth setup instructions, clean up CF Access references, and verify end-to-end flow.

## Requirements

- Functional: MCP + Agent endpoints respect auth; inbound email pipeline unchanged; README updated
- Non-functional: Zero downtime for email reception (inbound email handler has no auth gate)

## Related Code Files

- Modify: `workers/app.ts` — secure `/agents/*` and `/mcp` endpoints
- Modify: `workers/mcp.ts` — add optional auth context for MCP calls
- Modify: `README.md` — replace CF Access setup with Better Auth instructions
- Modify: `package.json` — remove `jose` dependency (no longer needed)
- Delete references: `POLICY_AUD`, `TEAM_DOMAIN` in docs and comments

## Implementation Steps

1. **Secure Agent WebSocket endpoint** (`workers/app.ts` lines 98-103)
   - Agent requests come via WebSocket from the authenticated SPA
   - Session cookie is sent with the WebSocket upgrade request
   - Validate session before forwarding to `routeAgentRequest`:
     ```typescript
     app.all("/agents/*", async (c) => {
       if (!import.meta.env.DEV) {
         const auth = createAuth(c.env);
         const session = await auth.api.getSession({ headers: c.req.raw.headers });
         if (!session) return c.text("Unauthorized", 401);
       }
       const response = await routeAgentRequest(c.req.raw, c.env);
       if (response) return response;
       return c.text("Agent not found", 404);
     });
     ```

2. **MCP endpoint auth strategy** (`workers/app.ts` lines 85-93)
   - MCP is used by external AI tools (Claude Code, Cursor) which can't easily send session cookies
   - **Decision:** Keep MCP accessible without session auth but add optional API key auth:
     - If `MCP_API_KEY` secret is set, require `Authorization: Bearer <key>` header
     - If not set, MCP remains open (existing behavior for dev/local use)
   - Add `MCP_API_KEY?: string` to `Env` type

3. **Inbound email handler** — no changes needed
   - `email()` handler in `workers/app.ts` (lines 113-129) is invoked by Cloudflare Email Routing directly, not via HTTP
   - No auth applies; this is correct behavior

4. **Update README.md** — replace CF Access instructions:
   - Remove: Cloudflare Access setup steps (steps 2), troubleshooting section
   - Add: First-time setup instructions (visit app → /setup → create admin)
   - Add: Invite flow (admin panel → invite member)
   - Add: Required secrets: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
   - Add: D1 database creation step
   - Update security model description:
     > "Users authenticate via email/password. Admins manage team members and assign mailbox access via the /admin panel. Members only see mailboxes assigned to them."

5. **Clean up CF Access references:**
   - Remove `jose` from `package.json` dependencies
   - Remove `getAccessUrls()` function from `workers/app.ts`
   - Remove comments referencing CF Access policy
   - Remove `POLICY_AUD` and `TEAM_DOMAIN` from any remaining docs

6. **End-to-end verification checklist:**
   - Fresh deploy → visit app → redirect to /setup
   - Create admin account → lands on home page with all mailboxes
   - Admin → /admin → create member (email + password + assign mailboxes)
   - Member logs in with provided credentials → sees only assigned mailboxes
   - Member tries accessing unassigned mailbox URL → 403
   - Admin changes member role to admin → member now sees all
   - Logout → redirect to /login
   - Inbound email still processed correctly (no auth gate)
   - Agent chat works for authenticated users
   - MCP works with API key (if configured)

7. **Production deploy steps:**
   ```bash
   # 1. Create D1 databases
   npx wrangler d1 create auth-db-production

   # 2. Apply migrations
   npx wrangler d1 migrations apply auth-db-production --remote --env production

   # 3. Set secrets
   npx wrangler secret put BETTER_AUTH_SECRET --env production
   npx wrangler secret put BETTER_AUTH_URL --env production

   # 4. Deploy
   npm run deploy

   # 5. Visit app → /setup → create admin
   # 6. (Optional) Disable Cloudflare Access on Worker
   ```

## Success Criteria

- [ ] Agent WebSocket requires valid session
- [ ] MCP endpoint supports optional API key auth
- [ ] Inbound email pipeline unaffected
- [ ] `jose` removed from dependencies
- [ ] All CF Access references removed from code and docs
- [ ] README has complete new auth setup guide
- [ ] Full end-to-end flow works: setup → invite → login → permission → logout
- [ ] Production deploy steps documented and tested

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| MCP users lose access | API key fallback; documented in README |
| Existing CF Access deployments break | Migration guide in README; /setup handles transition |
| WebSocket auth validation overhead | Single D1 query on upgrade, not per-message |
