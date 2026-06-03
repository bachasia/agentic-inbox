---
phase: 4
title: "Admin Panel UI"
status: complete
priority: P1
effort: "4h"
dependencies: [3]
---

# Phase 4: Admin Panel UI

## Overview

Build a dedicated `/admin` panel for managing users and mailbox assignments. Admin creates members directly (email + password), edits roles, assigns mailbox access, and removes users. No invite/email flow — admin shares credentials with members directly.
<!-- Updated: Validation Session 1 - removed invite flow, admin creates users directly with password -->

## Requirements

- Functional: User list with search, create member (email+password+mailboxes), edit role, assign mailboxes, remove user
- Non-functional: Admin-only access (redirect non-admins), responsive layout matching existing app

## Architecture

```
/admin (layout)
  ├── /admin (index) — user list + create button
  └── /admin/users/:userId — edit user: role, mailbox assignments

Backend:
  POST   /api/v1/admin/users                      — create user (email, password, name, role, mailboxIds)
  GET    /api/v1/admin/users                       — list users (paginated, search)
  PUT    /api/v1/admin/users/:userId               — update role
  DELETE /api/v1/admin/users/:userId               — remove user
  GET    /api/v1/admin/users/:userId/mailboxes     — get assigned mailboxes
  PUT    /api/v1/admin/users/:userId/mailboxes     — set mailbox assignments
```

## Related Code Files

- Modify: `app/routes.ts` — add `/admin` routes
- Modify: `workers/index.ts` — mount admin API routes with `requireAdmin`
- Create: `workers/routes/admin-routes.ts` — admin API handlers
- Create: `app/routes/admin.tsx` — admin layout (sidebar + outlet)
- Create: `app/routes/admin-index.tsx` — user list + create member dialog
- Create: `app/routes/admin-user-detail.tsx` — edit user role + mailbox assignments
- Create: `app/queries/admin.ts` — TanStack Query hooks for admin API
- Create: `app/services/admin-api.ts` — admin API client functions

## Implementation Steps

1. **Create `workers/routes/admin-routes.ts`** — Hono sub-app with admin endpoints:

   **User creation (direct, no invite):**
   - `POST /api/v1/admin/users` with body `{ email, password, name, mailboxIds }`:
     1. Create user via `auth.api.createUser({ email, password, name, role: "member" })`
     2. Insert mailbox_permission rows for each mailboxId
     3. Return created user with assigned mailboxes
   - Validation: email uniqueness, password min length, mailboxIds exist in R2

   **User management:**
   - `GET /api/v1/admin/users` — list users with pagination/search (wraps `auth.api.listUsers`)
   - `PUT /api/v1/admin/users/:userId` — update role (wraps `auth.api.setRole`); prevent demoting last admin
   - `DELETE /api/v1/admin/users/:userId` — remove user + cascade delete mailbox_permission entries; prevent self-deletion and last-admin deletion
   - `GET /api/v1/admin/users/:userId/mailboxes` — query mailbox_permission for user
   - `PUT /api/v1/admin/users/:userId/mailboxes` — body `{ mailboxIds: string[] }` — replace all assignments (delete old, insert new)

2. **Mount admin routes in `workers/index.ts`:**
   ```typescript
   import { adminRoutes } from "./routes/admin-routes";
   app.use("/api/v1/admin/*", requireAdmin);
   app.route("/api/v1/admin", adminRoutes);
   ```

3. **Create `app/services/admin-api.ts`** — thin API client:
   ```typescript
   export const adminApi = {
     createUser: (data) => api.post("/api/v1/admin/users", data),
     listUsers: (params) => api.get("/api/v1/admin/users", { params }),
     updateUserRole: (userId, role) => api.put(`/api/v1/admin/users/${userId}`, { role }),
     removeUser: (userId) => api.del(`/api/v1/admin/users/${userId}`),
     getUserMailboxes: (userId) => api.get(`/api/v1/admin/users/${userId}/mailboxes`),
     setUserMailboxes: (userId, mailboxIds) => api.put(`/api/v1/admin/users/${userId}/mailboxes`, { mailboxIds }),
   };
   ```

4. **Create `app/queries/admin.ts`** — TanStack Query hooks matching existing pattern in `app/queries/`

5. **Create `app/routes/admin.tsx`** — layout:
   - Admin guard: check `session.user.role === "admin"`, redirect to `/` if not
   - Header with "Admin" title, back to Mailboxes link
   - `<Outlet />` for child routes

6. **Create `app/routes/admin-index.tsx`** — user list page:
   - Table: name, email, role, # assigned mailboxes, actions (edit, remove)
   - Search input
   - "Create Member" button → dialog:
     - Fields: name, email, password, confirm password
     - Multi-select mailbox picker (fetches from `GET /api/v1/mailboxes`)
     - On submit → `POST /api/v1/admin/users`
     - Show created credentials summary for admin to share with member
   - Delete confirmation dialog (with protection warnings)

7. **Create `app/routes/admin-user-detail.tsx`** — user edit page:
   - Role selector (admin/member)
   - Mailbox assignment: checkbox list of all mailboxes, checked = assigned
   - Save button → `PUT /api/v1/admin/users/:userId` + `PUT .../mailboxes`
   - Reset password option → `auth.api.setUserPassword`

8. **Update `app/routes.ts`:**
   ```typescript
   route("admin", "routes/admin.tsx", [
     index("routes/admin-index.tsx"),
     route("users/:userId", "routes/admin-user-detail.tsx"),
   ]),
   ```

9. **Add admin link to app navigation** — show "Admin" link/icon in home page header for admin users

## Success Criteria

- [ ] `/admin` accessible only to admin role users
- [ ] User list displays all users with role, email, mailbox count
- [ ] Create member dialog: admin enters email + password + selects mailboxes
- [ ] Created member can immediately log in with provided credentials
- [ ] Admin can change user role between admin/member
- [ ] Admin can assign/revoke mailbox access per user
- [ ] Admin can remove users (cascades permission entries)
- [ ] Cannot delete last admin or self
- [ ] UI uses @cloudflare/kumo components, consistent with existing design

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Password sharing security | Admin creates initial password; member can change later (if password change UI added) |
| Large user list performance | Paginated API with limit/offset; D1 handles thousands of users fine |
| Admin removes themselves | Prevent self-deletion + last-admin deletion in API |
