---
title: "User Management & Mailbox RBAC"
description: "Replace Cloudflare Access with Better Auth (email/password), add D1-backed user management with Admin/Member roles, mailbox-level permissions, and a dedicated admin panel"
status: complete
priority: P1
branch: "main"
tags: [auth, rbac, better-auth, d1, admin-panel, user-management]
blockedBy: []
blocks: []
created: "2026-06-03T08:57:18.090Z"
createdBy: "ck:plan"
source: skill
---

# User Management & Mailbox RBAC

## Overview

Replace the current Cloudflare Access JWT trust boundary with Better Auth (email/password) backed by Cloudflare D1. Add Admin/Member roles where Admins manage users and access all mailboxes, Members only access assigned mailboxes. Includes a dedicated `/admin` panel, invite-only registration, and a first-time `/setup` flow.

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

## Key Decisions

- **Better Auth** over custom JWT: built-in admin plugin, session management, RBAC, React client
- **D1** over DO SQLite: user data is cross-mailbox/global, D1 fits shared queries
- **Direct user creation** over invite flow: admin creates member accounts with email+password, shares credentials directly. No invite table, no email sending needed
- **Manual SQL migration** over Better Auth CLI generate: full control, includes custom mailbox_permission table
- **Public endpoints mounted before requireAuth**: `/api/v1/auth/setup-status` and `/api/v1/config` need to be accessible without session
- **First user auto-admin**: custom logic in /setup handler checks user count, auto-promotes to admin via `auth.api.setRole`
- **Disable `cookieCache`**: workaround for Better Auth session bug #4203
- **Auth per-request**: edge runtime requires creating auth instance per request (no shared state)

## Phases

| Phase | Name | Status | Effort | Dependencies |
|-------|------|--------|--------|-------------|
| 1 | [D1 + Better Auth Setup](./phase-01-d1-better-auth-setup.md) | Pending | 2h | None |
| 2 | [Auth Middleware + Login](./phase-02-auth-middleware-login.md) | Pending | 3h | Phase 1 |
| 3 | [Mailbox Permission Layer](./phase-03-mailbox-permission-layer.md) | Pending | 2h | Phase 2 |
| 4 | [Admin Panel UI](./phase-04-admin-panel-ui.md) | Pending | 4h | Phase 3 |
| 5 | [Integration + Migration](./phase-05-integration-migration.md) | Pending | 2h | Phase 4 |

## Dependencies

- No cross-plan blockers
- Requires creating D1 database via `wrangler d1 create`
- Requires `BETTER_AUTH_SECRET` env secret

## Brainstorm Report

[brainstorm-260603-1535-user-management-rbac-report.md](../reports/brainstorm-260603-1535-user-management-rbac-report.md)

## Research Report

[researcher-260603-1555-better-auth-cloudflare-d1-hono-integration-report.md](../reports/researcher-260603-1555-better-auth-cloudflare-d1-hono-integration-report.md)

## Validation Log

### Session 1 — 2026-06-03
**Trigger:** Pre-implementation validation of auth/RBAC plan
**Questions asked:** 4

#### Verification Results
- **Tier:** Full (5 phases, all 4 roles)
- **Claims checked:** 28
- **Verified:** 26 | **Failed:** 1 | **Unverified:** 1

#### Failures
1. [Flow Tracer] `/api/v1/auth/setup-status` behind `requireAuth` — unauthenticated users can't reach it
2. [Unverified] Better Auth `admin()` plugin `defaultRole` — may need custom first-user promotion logic

#### Questions & Answers

1. **[Architecture]** Endpoint `/api/v1/auth/setup-status` blocked by requireAuth — how to handle?
   - Options: Mount before requireAuth | `/api/public/*` namespace | Whitelist in middleware
   - **Answer:** Mount before requireAuth
   - **Rationale:** Simplest approach, explicit ordering in Hono chain

2. **[Assumptions]** First user auto-admin mechanism — Better Auth may not support natively
   - Options: Custom logic in /setup handler | Seed via CLI | ADMIN_EMAIL env var
   - **Answer:** Custom logic in /setup handler
   - **Rationale:** Self-service setup flow, no CLI dependency for first deploy

3. **[Architecture]** D1 schema migration strategy
   - Options: Manual SQL | Better Auth CLI + custom SQL | Drizzle Kit
   - **Answer:** Manual SQL
   - **Rationale:** Full control over all tables including custom mailbox_permission

4. **[Scope]** Invite email flow vs direct user creation
   - Options: CF Email Service | Copy link | Both
   - **Answer:** Skip invite entirely — admin creates user+password directly
   - **Rationale:** Simpler, fewer moving parts, no email dependency. Admin shares credentials verbally/chat

#### Confirmed Decisions
- Public endpoints: mount before requireAuth in Hono chain
- First user: custom count-check + setRole in /setup backend handler
- Migration: hand-written SQL, no CLI generate
- User creation: admin creates directly with email+password, no invite flow

#### Impact on Phases
- Phase 1: Remove invite table from schema; migration is manual SQL only
- Phase 2: Mount setup-status before requireAuth; add auto-promote logic
- Phase 4: Replace invite flow with direct create-user dialog; remove invite routes/UI
- Phase 5: No invite email references to clean up

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01 through phase-05
- Decision deltas checked: 4
- Reconciled stale references: 6 (invite table, invite routes, invite UI, invite email, invite API, setup token flow)
- Unresolved contradictions: 0
