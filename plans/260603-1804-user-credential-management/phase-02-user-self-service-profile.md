---
phase: 2
title: User Self-Service Profile
status: completed
priority: P2
effort: 2.5h
dependencies: []
---

# Phase 2: User Self-Service Profile

## Overview

New `/profile` route where any logged-in user (admin or member) can update their own display name, email, and password. Frontend-only — calls Better Auth `authClient.*` methods directly, no new backend endpoints needed.

## Requirements

- Functional:
  - User can update their display name
  - User can update their email (uniqueness enforced by Better Auth)
  - User can change their password (must provide current password)
  - Profile page accessible to all authenticated users (admin + member)
- Non-functional:
  - Profile link visible in main `Header.tsx`
  - Errors from Better Auth surfaced inline
  - Password form clears on success

## Architecture

```
app/routes/profile.tsx
  ├── "Update Profile" section
  │     authClient.updateUser({ name, image: undefined })
  │     authClient.changeEmail({ newEmail })   ← separate call if email changed
  └── "Change Password" section
        authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: false })

app/components/Header.tsx
  └── Add UserCircleIcon button → navigate("/profile")
```

**authClient methods (no new backend needed):**
- `authClient.updateUser({ name })` — PATCH `/api/auth/update-user`
- `authClient.changeEmail({ newEmail })` — POST `/api/auth/change-email` (no verification email since `requireEmailVerification` not set)
- `authClient.changePassword({ currentPassword, newPassword })` — POST `/api/auth/change-password`

## Related Code Files

- Create: `app/routes/profile.tsx`
- Modify: `app/components/Header.tsx` — add Profile icon button
- Modify: `app/root.tsx` (or router config) — register `/profile` route

## Implementation Steps

### Route registration

1. **Check router config** — find where routes are registered (likely `app/root.tsx` or a routes config file). Add:
   ```tsx
   import ProfileRoute from "~/routes/profile";
   // ...
   <Route path="/profile" element={<ProfileRoute />} />
   ```
   Or in file-based routing (React Router v7 convention): the file `app/routes/profile.tsx` with `export default` is auto-registered.

### Profile page — app/routes/profile.tsx

2. **Create the file** with two independent sections:

```tsx
import { Button, Input, Text, useKumoToastManager } from "@cloudflare/kumo";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { authClient } from "~/lib/auth-client";

export function meta() {
  return [{ title: "Profile — Agentic Inbox" }];
}

export default function ProfileRoute() {
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate();
  const toastManager = useKumoToastManager();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  useEffect(() => {
    if (!isPending && !session) navigate("/login", { replace: true });
  }, [session, isPending, navigate]);

  useEffect(() => {
    if (session?.user) {
      setName(session.user.name ?? "");
      setEmail(session.user.email ?? "");
    }
  }, [session]);

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!session?.user) return;
    setProfileError(null);
    setIsSavingProfile(true);
    try {
      const ops: Promise<unknown>[] = [];
      if (name !== session.user.name) {
        ops.push(authClient.updateUser({ name }));
      }
      if (email !== session.user.email) {
        ops.push(authClient.changeEmail({ newEmail: email }));
      }
      if (ops.length === 0) {
        toastManager.add({ title: "No changes to save" });
        return;
      }
      await Promise.all(ops);
      toastManager.add({ title: "Profile updated" });
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }
    setIsSavingPassword(true);
    try {
      await authClient.changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toastManager.add({ title: "Password changed" });
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setIsSavingPassword(false);
    }
  };

  if (isPending || !session) return null;

  return (
    <div className="min-h-screen bg-kumo-recessed">
      <header className="border-b border-kumo-line bg-kumo-base">
        <div className="mx-auto max-w-lg px-4 py-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-sm text-kumo-subtle hover:text-kumo-default transition-colors"
          >
            ← Back
          </button>
          <span className="text-kumo-line">|</span>
          <h1 className="text-sm font-semibold text-kumo-default">Profile</h1>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-8 space-y-6">
        {/* Update Profile */}
        <form onSubmit={handleSaveProfile} className="rounded-xl border border-kumo-line bg-kumo-base p-5 space-y-4">
          <h2 className="text-sm font-semibold text-kumo-default">Update Profile</h2>
          {profileError && <Text variant="error" size="sm">{profileError}</Text>}
          <div className="space-y-3">
            <div>
              <label className="text-xs text-kumo-subtle mb-1 block">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label className="text-xs text-kumo-subtle mb-1 block">Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" size="sm" loading={isSavingProfile}>
              Save Profile
            </Button>
          </div>
        </form>

        {/* Change Password */}
        <form onSubmit={handleChangePassword} className="rounded-xl border border-kumo-line bg-kumo-base p-5 space-y-4">
          <h2 className="text-sm font-semibold text-kumo-default">Change Password</h2>
          {passwordError && <Text variant="error" size="sm">{passwordError}</Text>}
          <div className="space-y-3">
            <div>
              <label className="text-xs text-kumo-subtle mb-1 block">Current Password</label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            </div>
            <div>
              <label className="text-xs text-kumo-subtle mb-1 block">New Password</label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required placeholder="Min. 8 characters" />
            </div>
            <div>
              <label className="text-xs text-kumo-subtle mb-1 block">Confirm Password</label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" size="sm" loading={isSavingPassword}>
              Change Password
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
```

### Header link — app/components/Header.tsx

3. **Import** `UserCircleIcon` from `@phosphor-icons/react` (already a dep).

4. **Add Profile button** inside the `<div className="flex items-center gap-1 ml-auto shrink-0">` block, before ThemeToggleButton:
   ```tsx
   import { useNavigate } from "react-router";
   // ...
   const isProfileActive = location.pathname === "/profile";
   // ...
   <Tooltip content="Profile" side="bottom" asChild>
     <Button
       variant={isProfileActive ? "secondary" : "ghost"}
       shape="square"
       icon={<UserCircleIcon size={20} />}
       onClick={() => navigate("/profile")}
       aria-label="Profile"
     />
   </Tooltip>
   ```

### Router config

5. **Check `app/root.tsx`** for route registration pattern. React Router v7 file-based routing: if other routes are file-based, `app/routes/profile.tsx` may auto-register. Confirm and add explicit registration only if needed.

## Success Criteria

- [ ] `/profile` renders for logged-in user (admin + member)
- [ ] Name change saves and session reflects new name
- [ ] Email change saves — duplicate email shows error
- [ ] Password change requires correct current password; wrong password shows error
- [ ] Confirm password mismatch shows inline error before submitting
- [ ] Profile icon visible in Header, highlights when on `/profile`
- [ ] Unauthenticated access redirects to `/login`

## Risk Assessment

- **`authClient.changeEmail` behavior**: If Better Auth requires email verification even without `requireEmailVerification` set, the change may silently queue rather than apply immediately. Test empirically; if verification is triggered, set `sendVerificationEmail: false` in `emailAndPassword` config.
- **Session not updating after name change**: `authClient.updateUser` should invalidate the session cache. If `session.user.name` doesn't update, call `authClient.useSession` refetch or force reload.
- **Route registration**: Verify React Router v7 file-based routing convention in this project before adding explicit route — avoid double-registration.
