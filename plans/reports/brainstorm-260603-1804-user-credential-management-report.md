# Brainstorm Report: User Credential Management

**Date:** 2026-06-03  
**Scope:** Admin credential management + User self-service profile

---

## Problem Statement

1. Admin cần đổi được name/email/password của bất kỳ user nào từ trang user detail
2. User cần tự đổi được name/email/password của chính mình qua trang profile

## Out of Scope

- Tạo user với role admin (feature #1 bị bỏ)
- Email verification flow (internal app, disable verification)

---

## Agreed Solution: Approach A — Leverage Better Auth APIs

### Rationale

Better Auth đã expose đủ API:
- Admin plugin: `adminUpdateUser`, `adminSetUserPassword` — không cần current password, lo hashing
- Self-service: `authClient.updateUser()`, `authClient.changeEmail()`, `authClient.changePassword()` — cần current password

Tránh reinvent password hashing, session invalidation, email uniqueness check.

---

## Implementation Plan

### Part 1: Admin Credential Management

**Files to modify:**
- `app/routes/admin-user-detail.tsx` — thêm 2 sections: Edit Name/Email, Set Password
- `workers/routes/admin-routes.ts` — thêm `PUT /api/v1/admin/users/:userId/credentials`
- `app/services/admin-api.ts` — thêm `updateUserCredentials()`
- `app/queries/admin.ts` — thêm `useUpdateUserCredentials()`

**Backend endpoint:**
```
PUT /api/v1/admin/users/:userId/credentials
Body: { name?, email?, password? }
```
- Uses Better Auth admin plugin API for updates
- Requires `requireAdmin` middleware
- Validates at least one field present
- Last-admin protection: nếu đổi email của admin, check vẫn còn admin khác

**UI sections in admin-user-detail.tsx:**
- Section "Edit Profile": fields name + email, Save button
- Section "Set Password": new password field (no current required), Set Password button
- Separate forms để submit độc lập

---

### Part 2: User Self-Service Profile

**Files to create:**
- `app/routes/profile.tsx` — profile page

**Files to modify:**
- Navigation/header — thêm link Profile

**Frontend-only approach** (gọi Better Auth authClient trực tiếp):
- `authClient.updateUser({ name })` — đổi display name
- `authClient.changeEmail({ newEmail })` — đổi email
- `authClient.changePassword({ currentPassword, newPassword })` — cần current password

**UI layout:**
- Section "Update Profile": name + email fields
- Section "Change Password": current password + new password + confirm

---

## Key Considerations

1. **Email change verification:** Cần check `emailVerification` config trong `workers/auth/server.ts`. Nếu enabled, user sẽ nhận verification email — với internal app nên disabled hoặc dùng admin API bypass
2. **Session invalidation:** Better Auth tự xử lý khi đổi password
3. **Error handling:** Email đã tồn tại, current password sai cần hiện lỗi rõ

---

## Unresolved Questions

- Email change: Better Auth config hiện có bật email verification không? Nếu có cần disable cho internal app.
