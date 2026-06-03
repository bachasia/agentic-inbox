---
phase: 2
title: Backend all-emails endpoint
status: completed
priority: P2
effort: 1h
dependencies: []
---

# Phase 2: Backend all-emails endpoint

## Overview

Add `GET /api/v1/emails/all` to `workers/index.ts`. Fetches all visible mailboxes for the current user, calls the per-mailbox DO in parallel to get inbox emails, merges and sorts by date desc, returns a flat paginated array with `mailboxId` tag on each email.

## Related Code Files

- Modify: `workers/index.ts`
- Read first: `workers/durableObject/index.ts` — verify exact RPC method name for listing emails (look for `listEmails`, `getEmails`, or the same method called by `GET /api/v1/mailboxes/:mailboxId/emails`)

## Architecture

```
GET /api/v1/emails/all?folder=inbox&limit=25&offset=0
  → list visible mailboxes (same auth logic as GET /api/v1/mailboxes)
  → Promise.all(mailboxes.map(m => DO stub.method(folder, opts)))
  → flat merge → sort by date desc → slice(offset, offset+limit)
  → { emails: (Email & { mailboxId: string })[], total: number }
```

No new files needed — one new route in `workers/index.ts`.

## Implementation Steps

1. **Read** `workers/durableObject/index.ts` to find the RPC method the email-list route uses. The route `GET /api/v1/mailboxes/:mailboxId/emails` (line 202 in index.ts) calls `c.var.mailboxStub.<method>` — identify this method name and its signature.

2. **Add route** in `workers/index.ts` after the mailboxes block, before parameterized `/:mailboxId/*` routes:

   ```typescript
   app.get("/api/v1/emails/all", async (c: AppContext) => {
     const user = c.get("user");
     const folder = c.req.query("folder") ?? "inbox";
     const limit = Math.min(parseInt(c.req.query("limit") ?? "25", 10), 100);
     const offset = parseInt(c.req.query("offset") ?? "0", 10);

     const allMailboxes = await listMailboxes(c.env.BUCKET);
     let visible = allMailboxes;
     if (user && user.role !== "admin") {
       const allowedIds = new Set(await getUserMailboxIds(c.env, user.id));
       visible = allMailboxes.filter((m) => allowedIds.has(m.id));
     }

     const perMailbox = await Promise.all(
       visible.map(async (m) => {
         const stub = c.env.MAILBOX.get(c.env.MAILBOX.idFromName(m.id));
         // Replace <method> with actual DO RPC name from Step 1
         const result = await (stub as any).<method>(folder, { limit: 200, offset: 0 });
         return (result.emails ?? result).map((e: any) => ({
           ...e,
           mailboxId: m.id,
         }));
       }),
     );

     const merged = perMailbox
       .flat()
       .sort((a, b) => new Date(b.date ?? b.receivedAt).getTime() - new Date(a.date ?? a.receivedAt).getTime());

     return c.json({
       emails: merged.slice(offset, offset + limit),
       total: merged.length,
     });
   });
   ```

3. **Place** this route BEFORE `app.use("/api/v1/mailboxes/:mailboxId/*", requireMailbox)` — otherwise the static `/emails/all` segment conflicts with the parameterized middleware.

   Actually, `/api/v1/emails/all` is a different path prefix (`/emails/` not `/mailboxes/`) so there's no conflict. Place it after the mailboxes GET/POST block (~line 200).

4. **Verify** the route is auth-protected — `requireAuth` middleware applies globally in workers/index.ts; confirm this covers `/api/v1/emails/all`.

## Success Criteria

- [ ] `GET /api/v1/emails/all` returns 200 with `{ emails: [...], total: N }`
- [ ] Each email object has `mailboxId` field
- [ ] `?folder=inbox&limit=25&offset=0` pagination works
- [ ] Non-admin users only see emails from their assigned mailboxes
- [ ] TypeScript compiles — no `any` type errors leaking into response

## Risk Assessment

- **DO method name unknown**: Must read `workers/durableObject/index.ts` first (Step 1). If no direct RPC method exists, fall back to calling the internal fetch handler.
- **Performance**: fetches up to 200 emails per mailbox client-side merges in memory. Acceptable for <20 mailboxes. Large deployments may need a DO-level aggregation — out of scope here.
- **Offset-based pagination over merged data**: re-fetches all mailboxes on each paginated request. Simple and acceptable for MVP.
