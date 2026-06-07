---
phase: 1
title: "Layout & Route Restructure"
status: pending
priority: P2
effort: "1h"
dependencies: []
---

# Phase 1: Layout & Route Restructure

## Overview

Tạo `settings-layout.tsx` (shared layout với nav tabs) và cập nhật `routes.ts` để đổi flat settings route thành nested layout + children. Index route redirect sang `/settings/general`.

## Requirements

- Functional: `/mailbox/:id/settings` redirect tự động sang `/mailbox/:id/settings/general`
- Functional: Nav tabs hiển thị "General" và "AI Settings" với active state
- Functional: Header.tsx gear icon navigate `/settings` vẫn hoạt động (vì index redirect)
- Non-functional: layout file < 80 LOC

## Architecture

### routes.ts thay đổi

```ts
// Từ:
route("settings", "routes/settings.tsx"),

// Thành:
route("settings", "routes/settings-layout.tsx", [
  index("routes/settings-redirect.tsx"),         // redirect → /settings/general
  route("general", "routes/settings-general.tsx"),
  route("ai", "routes/settings-ai.tsx"),
]),
```

### settings-layout.tsx

```tsx
// Render: h1 "Settings" + tab bar [General | AI Settings] + <Outlet />
// Tabs: NavLink tới /settings/general và /settings/ai
// isActive styling dùng NavLink className callback (giống Sidebar.tsx pattern)
// Layout cung cấp title chung, mỗi child page KHÔNG tự render h1
```

### settings-redirect.tsx

Tiny file, chỉ `<Navigate to="general" replace />`.

## Related Code Files

- Create: `app/routes/settings-layout.tsx`
- Create: `app/routes/settings-redirect.tsx`
- Modify: `app/routes.ts`

## Implementation Steps

1. **Tạo `app/routes/settings-redirect.tsx`**:
   ```tsx
   import { Navigate } from "react-router";
   export default function SettingsRedirect() {
     return <Navigate to="general" replace />;
   }
   ```

2. **Tạo `app/routes/settings-layout.tsx`** với nav tabs:
   - Import `NavLink` từ `react-router`
   - 2 tabs: "General" → `general`, "AI Settings" → `ai`
   - Active style: `bg-kumo-fill font-semibold text-kumo-default` (match Sidebar pattern)
   - Render `<Outlet />` bên dưới tabs

3. **Cập nhật `app/routes.ts`**:
   - Đổi `route("settings", "routes/settings.tsx")` thành nested structure (xem Architecture)

4. **Chạy `npx tsc --noEmit`** — kiểm tra compile errors

## Success Criteria

- [ ] `/mailbox/:id/settings` redirect sang `/settings/general` (không 404)
- [ ] Nav tabs render với active state đúng
- [ ] `npx tsc --noEmit` pass
- [ ] Header.tsx gear icon navigate vẫn hoạt động

## Risk Assessment

- `<Navigate to="general" replace />` dùng relative path — cần test kỹ với React Router v7 nested routes behavior. Nếu relative path không work, dùng absolute: `to={`/mailbox/${mailboxId}/settings/general`}` (cần `useParams`).
