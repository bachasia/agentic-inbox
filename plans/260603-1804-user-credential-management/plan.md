---
title: User Credential Management
description: >-
  Admin can edit name/email/password of any user; users can edit their own
  credentials via profile page
status: pending
priority: P2
branch: main
tags:
  - auth
  - better-auth
  - admin
  - profile
  - credentials
blockedBy: []
blocks: []
created: '2026-06-03T11:10:35.736Z'
createdBy: 'ck:plan'
source: skill
---

# User Credential Management

## Overview

Two features built on top of the existing Better Auth + D1 auth system:

1. **Admin credential management** — admin can edit name, email, and password for any user from the user detail page
2. **User self-service profile** — any logged-in user can edit their own name, email, and password from a `/profile` page

No email verification flow (internal app, `emailVerification` not configured).

## Architecture

```
Admin path:
PUT /api/v1/admin/users/:userId/credentials
  → requireAdmin middleware
  → Better Auth admin API (updateUser, setPassword)
  → D1 user + account tables

User self-service path:
authClient.updateUser()      → /api/auth/update-user
authClient.changeEmail()     → /api/auth/change-email
authClient.changePassword()  → /api/auth/change-password (requires currentPassword)
```

## Key Decisions

- **Better Auth admin API** for admin-side changes: handles password hashing, no current-password needed
- **authClient.* methods** for self-service: Better Auth client handles session refresh, current-password validation
- **Separate forms per operation**: role/mailbox form unchanged; credentials section is independent forms to avoid accidental partial saves
- **Email uniqueness**: Better Auth enforces uniqueness on its side; surface its error messages in UI
- **No email verification**: `emailAndPassword.requireEmailVerification` not set in `server.ts` → email changes are immediate

## Phases

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| 1 | [Admin Credential Management](./phase-01-admin-credential-management.md) | Pending | Completed |
| 2 | [User Self-Service Profile](./phase-02-user-self-service-profile.md) | Pending | Completed |

## Dependencies

- Existing: `workers/auth/server.ts`, `workers/routes/admin-routes.ts`, `app/routes/admin-user-detail.tsx`
- Existing: `app/lib/auth-client.ts`, `app/services/admin-api.ts`, `app/queries/admin.ts`
