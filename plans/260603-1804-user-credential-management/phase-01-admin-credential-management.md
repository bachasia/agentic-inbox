---
phase: 1
title: Admin Credential Management
status: completed
priority: P2
effort: 3h
dependencies: []
---

# Phase 1: Admin Credential Management

## Overview

Add credential editing (name, email, password) to the admin user detail page. Admin can change any user's credentials without knowing their current password. Uses Better Auth admin API endpoints.

## Requirements

- Functional:
  - Admin can update a user's display name
  - Admin can update a user's email (with uniqueness enforcement)
  - Admin can set a new password for a user (no current password required)
  - Changes are independent — name/email form and password form submit separately
- Non-functional:
  - Error messages from Better Auth surfaced in UI (email taken, password too short)
  - Last-admin protection: email change is fine; role/delete protection already exists

## Architecture

```
Frontend (admin-user-detail.tsx)
  ├── Section "Edit Profile" → PUT /api/v1/admin/users/:userId/credentials
  │     body: { name?, email? }
  └── Section "Set Password"  → PUT /api/v1/admin/users/:userId/credentials
        body: { password }

Backend (admin-routes.ts)
  PUT /users/:userId/credentials
    → validate: at least one field
    → if name/email: auth.api.adminUpdateUser or direct Drizzle update
    → if password: auth.api.setUserPassword (admin plugin)
    → return updated fields
```

**Better Auth admin plugin methods:**
- Name/email: `auth.api.adminUpdateUser({ body: { userId, name?, email? }, headers })`  
  — or fallback: direct Drizzle `UPDATE "user" SET name=?, email=? WHERE id=?` if adminUpdateUser not available
- Password: `auth.api.setUserPassword({ body: { userId, newPassword }, headers })`  
  — handles bcrypt hashing internally

## Related Code Files

- Modify: `workers/routes/admin-routes.ts` — add `PUT /users/:userId/credentials`
- Modify: `app/routes/admin-user-detail.tsx` — add Edit Profile + Set Password sections
- Modify: `app/services/admin-api.ts` — add `updateUserCredentials()`
- Modify: `app/queries/admin.ts` — add `useUpdateUserCredentials()`

## Implementation Steps

### Backend

1. **Add endpoint to `admin-routes.ts`** after the existing `PUT /users/:userId` (role endpoint):
   ```ts
   app.put("/users/:userId/credentials", async (c) => {
     const { userId } = c.req.param();
     const body = await c.req.json() as { name?: string; email?: string; password?: string };
   
     if (!body.name && !body.email && !body.password) {
       return c.json({ error: "At least one field required" }, 400);
     }
     if (body.password && body.password.length < 8) {
       return c.json({ error: "Password must be at least 8 characters" }, 400);
     }
   
     const auth = createAuth(c.env);
   
     if (body.name !== undefined || body.email !== undefined) {
       // Check email uniqueness if changing email
       if (body.email) {
         const existing = await c.env.AUTH_DB.prepare(
           `SELECT id FROM "user" WHERE email = ? AND id != ?`
         ).bind(body.email, userId).first();
         if (existing) return c.json({ error: "Email already in use" }, 409);
       }
       await auth.api.adminUpdateUser({
         body: { userId, ...(body.name && { name: body.name }), ...(body.email && { email: body.email }) },
         headers: c.req.raw.headers,
       });
     }
   
     if (body.password) {
       await auth.api.setUserPassword({
         body: { userId, newPassword: body.password },
         headers: c.req.raw.headers,
       });
     }
   
     return c.json({ success: true });
   });
   ```

2. **Verify Better Auth method names** by checking what `auth.api` exposes — if `adminUpdateUser` or `setUserPassword` don't exist on the admin plugin, fall back to Drizzle direct update for name/email and `account` table update for password using `bcryptjs`.

### Frontend — admin-api.ts

3. **Add interface and method**:
   ```ts
   export interface UpdateCredentialsPayload {
     name?: string;
     email?: string;
     password?: string;
   }
   
   // inside adminApi object:
   updateUserCredentials: (userId: string, data: UpdateCredentialsPayload) =>
     req<{ success: boolean }>(`/api/v1/admin/users/${userId}/credentials`, {
       method: "PUT",
       body: JSON.stringify(data),
     }),
   ```

### Frontend — admin.ts (queries)

4. **Add mutation hook**:
   ```ts
   export function useUpdateUserCredentials() {
     const qc = useQueryClient();
     return useMutation({
       mutationFn: ({ userId, data }: { userId: string; data: UpdateCredentialsPayload }) =>
         adminApi.updateUserCredentials(userId, data),
       onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
     });
   }
   ```

### Frontend — admin-user-detail.tsx

5. **Add state** at top of component:
   ```ts
   const updateCredentials = useUpdateUserCredentials();
   const [profileName, setProfileName] = useState("");
   const [profileEmail, setProfileEmail] = useState("");
   const [newPassword, setNewPassword] = useState("");
   const [credError, setCredError] = useState<string | null>(null);
   ```

6. **Sync profile state** from user data (add to existing useEffect for user):
   ```ts
   useEffect(() => {
     if (user) {
       setRole(user.role);
       setProfileName(user.name);
       setProfileEmail(user.email);
     }
   }, [user]);
   ```

7. **Add "Edit Profile" section** inside `<form>` after the Role section:
   ```tsx
   <div className="rounded-xl border border-kumo-line bg-kumo-base p-5 space-y-4">
     <h3 className="text-sm font-semibold text-kumo-default">Edit Profile</h3>
     {credError && <Text variant="error" size="sm">{credError}</Text>}
     <div className="space-y-3">
       <div>
         <label className="text-xs text-kumo-subtle mb-1 block">Name</label>
         <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} />
       </div>
       <div>
         <label className="text-xs text-kumo-subtle mb-1 block">Email</label>
         <Input type="email" value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} />
       </div>
     </div>
     <div className="flex justify-end">
       <Button
         type="button" variant="primary" size="sm"
         loading={updateCredentials.isPending}
         onClick={async () => {
           if (!userId) return;
           setCredError(null);
           try {
             await updateCredentials.mutateAsync({
               userId,
               data: { name: profileName, email: profileEmail },
             });
             toastManager.add({ title: "Profile updated" });
           } catch (err: unknown) {
             setCredError(err instanceof Error ? err.message : "Failed to update profile");
           }
         }}
       >
         Save Profile
       </Button>
     </div>
   </div>
   ```

8. **Add "Set Password" section** after Edit Profile section:
   ```tsx
   <div className="rounded-xl border border-kumo-line bg-kumo-base p-5 space-y-4">
     <h3 className="text-sm font-semibold text-kumo-default">Set Password</h3>
     <div>
       <label className="text-xs text-kumo-subtle mb-1 block">New Password</label>
       <Input
         type="password"
         value={newPassword}
         onChange={(e) => setNewPassword(e.target.value)}
         placeholder="Min. 8 characters"
       />
     </div>
     <div className="flex justify-end">
       <Button
         type="button" variant="primary" size="sm"
         loading={updateCredentials.isPending}
         onClick={async () => {
           if (!userId || newPassword.length < 8) return;
           setCredError(null);
           try {
             await updateCredentials.mutateAsync({ userId, data: { password: newPassword } });
             setNewPassword("");
             toastManager.add({ title: "Password updated" });
           } catch (err: unknown) {
             setCredError(err instanceof Error ? err.message : "Failed to update password");
           }
         }}
       >
         Set Password
       </Button>
     </div>
   </div>
   ```

## Success Criteria

- [ ] Admin can change a user's name from the user detail page
- [ ] Admin can change a user's email — duplicate email returns clear error
- [ ] Admin can set a new password without knowing the current one
- [ ] Each credential operation succeeds independently (name/email + password are separate)
- [ ] Toast notifications shown on success
- [ ] Errors displayed inline in the relevant section

## Risk Assessment

- **`adminUpdateUser` / `setUserPassword` may not exist on Better Auth admin plugin** — if so, fall back to direct Drizzle + bcryptjs; plan includes fallback approach
- **Email uniqueness check**: performed manually before calling Better Auth (D1 query) to give clean error message rather than parsing Better Auth error response
- **File size**: `admin-user-detail.tsx` currently 140 lines; adding ~60 lines keeps it under 200. Monitor.
