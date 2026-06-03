# Brainstorm: User Management & Mailbox RBAC

**Date:** 2026-06-03
**Status:** Approved — ready for planning

## Problem Statement

Current app uses Cloudflare Access as single trust boundary — anyone who passes the policy accesses ALL mailboxes. Need per-employee user accounts with mailbox-level access control.

## Requirements

| Item | Decision |
|------|----------|
| Auth system | Better Auth (email/password), replace CF Access entirely |
| Storage | Cloudflare D1 (shared serverless SQLite) |
| Roles | Admin (full access + user mgmt) + Member (assigned mailboxes only) |
| User creation | First user = auto Admin via /setup; subsequent = invite-only by Admin |
| Mailbox permission | Full access (read, send, settings, agent, rules) for assigned mailboxes |
| Admin UI | Dedicated /admin panel with user CRUD + mailbox assignment |
| CF Access | Remove entirely |

## Architecture

```
Browser → /login → Better Auth → Session Cookie (httpOnly)
                                       ↓
                          Auth Middleware (Hono)
                                       ↓
                      ┌─────────────────────────────┐
                      │  D1 Database (shared)        │
                      │  ├── user (Better Auth)      │
                      │  ├── session (Better Auth)   │
                      │  ├── account (Better Auth)   │
                      │  ├── verification (BA)       │
                      │  └── mailbox_permission      │
                      └─────────────────────────────┘
                                       ↓
                      Permission check (admin=all, member=assigned)
                                       ↓
                          Mailbox Durable Object
```

## Key Components

### 1. Better Auth Server
- Mount `/api/auth/*` on Hono
- D1 adapter + Drizzle ORM
- Admin plugin for user management
- Session via httpOnly cookie

### 2. D1 Schema
- Better Auth auto-tables: `user`, `session`, `account`, `verification`
- Custom: `mailbox_permission(userId, mailboxId)` junction table

### 3. Auth Middleware (replaces CF Access)
- Validate session cookie on every API request
- Inject `user` + `role` into Hono context
- Admin guard for `/api/admin/*` routes

### 4. Mailbox Permission Check
- In `workers/lib/mailbox.ts` middleware
- Admin → access all mailboxes
- Member → only mailboxes in `mailbox_permission`

### 5. Frontend Routes
- `/login` — email/password form
- `/setup` — first-time admin creation (only when 0 users in DB)
- `/admin` — user list, invite, edit role, assign mailboxes, remove
- `home.tsx` — filter sidebar mailbox list by user permissions

### 6. Setup Flow
```
Deploy → Visit → 0 users? → /setup (create admin)
                  >0 users? → /login
Admin → /admin → Invite member (email link via CF Email Service)
Member → Click invite → Set password → See assigned mailboxes only
```

## Files Impacted

| File/Area | Change |
|-----------|--------|
| `wrangler.jsonc` | Add D1 binding |
| `workers/app.ts` | Replace CF Access middleware → Better Auth session |
| `workers/lib/mailbox.ts` | Add permission check |
| `workers/index.ts` | Mount auth + admin routes |
| New: `workers/auth/` | Better Auth config, D1 schema, admin routes |
| New: `app/routes/login.tsx` | Login page |
| New: `app/routes/setup.tsx` | First-time setup |
| New: `app/routes/admin/` | Admin panel (users, invites, permissions) |
| `app/routes/home.tsx` | Filter mailboxes by permission |
| New: `app/lib/auth-client.ts` | Better Auth React client |

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Better Auth + CF Workers compat | Official Cloudflare adapter exists |
| D1 cold start | Minimal for small user tables |
| Breaking existing deploys | /setup migration path for first admin |
| Invite emails need SMTP | Reuse existing CF Email Service binding |

## Out of Scope
- OAuth providers (Google/GitHub)
- 2FA/MFA
- Audit logging
- Password reset email
- Granular per-mailbox roles (read-only vs full)

## Next Steps
→ `/ck:plan` to create phased implementation plan
