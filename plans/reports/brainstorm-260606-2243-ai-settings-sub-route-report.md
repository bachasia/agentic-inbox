# Brainstorm: AI Settings Sub-Route

**Date:** 2026-06-06 | **Scope:** mailbox settings refactor + AI settings page

## Problem Statement

`settings.tsx` là 479 LOC (2.4x giới hạn 200 LOC), chứa tất cả trong 1 trang scroll dài. KB plan (phase-04) sắp thêm KB CRUD vào đây → sẽ càng nặng hơn. AI-related settings (Proactive AI, AI Agent Prompt, Automation Rules, sắp có KB) nên được tách thành trang riêng để dễ navigate và dễ maintain.

## Requirements

- **Expected output:** 2 settings sub-routes (general + ai) dưới 1 layout parent. URL: `/mailbox/:id/settings/general` và `/mailbox/:id/settings/ai`.
- **Acceptance criteria:** mỗi trang < 200 LOC, save chỉ ảnh hưởng section của mình, KB phase-04 import vào `settings-ai.tsx` thay vì `settings.tsx`.
- **Scope boundary:** chỉ tách route/layout, không redesign UI các section.
- **Constraints:** dùng React Router nested routes (đang dùng @react-router/dev), Kumo components, không thêm dependency mới.
- **Touchpoints:** `routes.ts`, `settings.tsx`, Sidebar.tsx (kiểm tra settings link), Header (kiểm tra link).

## Evaluated Approaches

### A: Sub-route riêng (chosen)
- Layout `settings-layout.tsx` render nav tabs + `<Outlet />`
- `settings-general.tsx`: Account, WooCommerce, Signature, Labels, Templates
- `settings-ai.tsx`: AI Agent Prompt, Proactive AI, Automation Rules (+ KB khi implement)
- **Pros:** clean URL, mỗi page độc lập, KB có đủ không gian
- **Cons:** thêm 1 layout file, URL thay đổi

### B: Tabs trên cùng 1 route
- Giữ `/settings`, thêm tab state
- **Pros:** không đổi route
- **Cons:** settings.tsx còn phức tạp hơn, KB CRUD bị hạn chế không gian

### C: Chỉ tách KB
- KB `/knowledge-base` route riêng, rest giữ nguyên
- **Pros:** minimal change
- **Cons:** không giải quyết LOC issue, AI settings vẫn scattered

## Final Design

### Route structure

```
route("settings", "routes/settings-layout.tsx", [
  index("routes/settings-general.tsx"),     // redirect or render general
  route("general", "routes/settings-general.tsx"),
  route("ai", "routes/settings-ai.tsx"),
])
```

### Content split

**General Settings** (`/settings/general`):
- Account (fromName, email)
- WooCommerce (delegated to WooCommerceSettingsSection component)
- Signature (RichTextEditor)
- Labels (self-contained mutations)
- Email Templates (self-contained mutations)
- Save: `fromName`, `signature`, `woocommerce`

**AI Settings** (`/settings/ai`):
- AI Agent Prompt (agentSystemPrompt)
- Proactive AI (unansweredDays, digestEnabled, digestTime)
- Automation Rules (self-contained mutations)
- [Upcoming] Knowledge Base — import `<KnowledgeBaseSettingsSection />` từ KB plan phase-04
- Save: `agentSystemPrompt`, `unansweredDays`, `digestEnabled`, `digestTime`

### Files

| Action | File |
|--------|------|
| Create | `app/routes/settings-layout.tsx` |
| Create | `app/routes/settings-general.tsx` |
| Create | `app/routes/settings-ai.tsx` |
| Modify | `app/routes.ts` |
| Delete | `app/routes/settings.tsx` |
| Check  | `app/components/Header.tsx` — update settings link if any |

### Impact on KB plan

Phase-04 của KB plan cần update: import `<KnowledgeBaseSettingsSection />` vào `settings-ai.tsx` thay vì `settings.tsx`.

## Risks

- Header.tsx có thể link tới `/settings` → cần kiểm tra và update
- `/settings` cũ cần redirect → `/settings/general` (index route)

## Unresolved Questions

None.
