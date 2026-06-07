---
title: "AI Settings Sub-Route Refactor"
description: "Tách settings.tsx (479 LOC) thành sub-routes: general và ai. AI Settings page chứa AI Agent Prompt, Proactive AI, Automation Rules, và KB section (upcoming)."
status: complete
priority: P2
branch: "main"
tags: ["settings", "refactor", "routing", "ai"]
blockedBy: []
blocks: ["260606-0856-knowledge-base-rag-craft-context"]
created: "2026-06-06T15:50:07.232Z"
createdBy: "ck:plan"
source: skill
---

# AI Settings Sub-Route Refactor

## Overview

`settings.tsx` hiện tại 479 LOC — 2.4x giới hạn 200 LOC — chứa tất cả settings trong 1 trang scroll. Plan này tách thành 2 sub-routes (`/settings/general` và `/settings/ai`) dưới 1 shared layout, mỗi trang < 200 LOC. KB plan phase-04 sẽ import `KnowledgeBaseSettingsSection` vào `settings-ai.tsx` thay vì `settings.tsx`.

**Brainstorm report:** `plans/reports/brainstorm-260606-2243-ai-settings-sub-route-report.md`

## Architecture

```
/mailbox/:mailboxId/settings          → index redirect → /settings/general
/mailbox/:mailboxId/settings/general  → settings-general.tsx
/mailbox/:mailboxId/settings/ai       → settings-ai.tsx
```

`settings-layout.tsx` renders nav tabs + `<Outlet />`. Header.tsx navigate `/settings` → vẫn hoạt động qua index redirect.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Layout & Route Restructure](./phase-01-layout-route-restructure.md) | Complete |
| 2 | [General Settings Page](./phase-02-general-settings-page.md) | Complete |
| 3 | [AI Settings Page & Cleanup](./phase-03-ai-settings-page-cleanup.md) | Complete |

## Key Files

| File | Action |
|------|--------|
| `app/routes/settings-layout.tsx` | Create |
| `app/routes/settings-general.tsx` | Create |
| `app/routes/settings-ai.tsx` | Create |
| `app/routes.ts` | Modify |
| `app/routes/settings.tsx` | Delete |
| `app/components/Header.tsx` | Verify navigate logic |
| `plans/260606-0856-knowledge-base-rag-craft-context/phase-04-frontend-settings-ui.md` | Update target file reference |

## Dependencies

Blocks KB plan `260606-0856-knowledge-base-rag-craft-context` phase-04: sau refactor này, phase-04 phải import `KnowledgeBaseSettingsSection` vào `settings-ai.tsx` thay vì `settings.tsx`.

## Validation Log

### Session 1 — 2026-06-06
**Trigger:** /ck:plan validate trước khi implement
**Questions asked:** 3

#### Questions & Answers

1. **[Architecture]** settings-layout.tsx render nav tabs ra sao?
   - Options: Tab bar nằm dưới h1 title | Chỉ tabs không có title
   - **Answer:** Tab bar nằm dưới h1 title (h1 "Settings" + tabs + Outlet)
   - **Rationale:** Layout cung cấp h1 chung; các child page không tự render title.

2. **[Scope]** useUpdateTemplate imported nhưng unused — Phase 2 xử lý thế nào?
   - Options: Drop unused import | Thêm edit UI luôn
   - **Answer:** Thêm edit UI luôn
   - **Rationale:** useUpdateTemplate đã tồn tại trong queries, thêm edit template UI là feature còn thiếu, nằm trong scope Phase 2.

3. **[Risk]** Nếu settings-ai.tsx > 200 LOC do Automation Rules — tách proactive hay luôn?
   - Options: Tách nếu > 200 LOC | Tách luôn từ đầu
   - **Answer:** Tách nếu > 200 LOC sau khi viết xong, rồi quyết định.
   - **Rationale:** YAGNI — chỉ extract khi thực sự cần.

#### Confirmed Decisions
- Layout: h1 "Settings" + tab bar [General | AI Settings] + Outlet trong `settings-layout.tsx`
- Template edit: `useUpdateTemplate` dùng trong phase-02, thêm edit button + pre-filled form
- LOC overflow: check sau khi viết, extract `AutomationRulesSettingsSection` chỉ khi > 200 LOC

#### Action Items
- [x] Phase 01: cập nhật settings-layout.tsx description thêm h1 title
- [x] Phase 02: thêm edit template UI + `useUpdateTemplate` vào Architecture
- [x] Phase 02: fix step numbering

#### Verification Results
- **Tier:** Standard (3 phases)
- **Claims checked:** 12
- **Verified:** 12 | **Failed:** 0 | **Unverified:** 0

#### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01, phase-02, phase-03
- Decision deltas checked: 3
- Reconciled stale references: 1 (useUpdateTemplate mention trong phase-02)
- Unresolved contradictions: 0
