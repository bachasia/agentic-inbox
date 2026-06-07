---
phase: 3
title: "AI Settings Page & Cleanup"
status: pending
priority: P2
effort: "1.5h"
dependencies: [2]
---

# Phase 3: AI Settings Page & Cleanup

## Overview

Tạo `settings-ai.tsx` chứa: AI Agent Prompt, Proactive AI, Automation Rules. Delete `settings.tsx` cũ. Cập nhật KB plan phase-04 để import vào `settings-ai.tsx`. Verify Header.tsx.

## Requirements

- Functional: AI Agent Prompt (agentSystemPrompt) save hoạt động
- Functional: Proactive AI (unansweredDays, digestEnabled, digestTime) save hoạt động
- Functional: Automation Rules list/create/delete/enable-toggle hoạt động
- Non-functional: `settings-ai.tsx` < 200 LOC (Rules dùng existing mutations — self-contained)
- Non-functional: KB phase-04 updated để import vào đúng file

## Architecture

### Content split

Từ `settings.tsx`, chuyển sang `settings-ai.tsx`:
- **AI Agent Prompt section**: `agentPrompt` state, textarea, reset button, Custom/Default badge
- **Proactive AI section**: `unansweredDays`, `digestEnabled`, `digestTime` states
- **Automation Rules section**: `useRules`, `useCreateRule`, `useUpdateRule`, `useDeleteRule` + `RuleBuilder`
- **Save button**: chỉ save `agentSystemPrompt`, `unansweredDays`, `digestEnabled`, `digestTime`

### handleSave trong settings-ai.tsx

```ts
const settings = {
  ...mailbox.settings,
  agentSystemPrompt: agentPrompt.trim() || undefined,
  unansweredDays,
  digestEnabled,
  digestTime,
};
await updateMailboxMutation.mutateAsync({ mailboxId, settings });
```

### KB plan phase-04 update

Sửa `plans/260606-0856-knowledge-base-rag-craft-context/phase-04-frontend-settings-ui.md`:
- Đổi target file từ `settings.tsx` → `settings-ai.tsx`
- Integration step: `import KnowledgeBaseSettingsSection from "~/components/settings/knowledge-base-settings-section"` vào `settings-ai.tsx`

### Cleanup

- Delete `app/routes/settings.tsx` (tất cả content đã được split)
- Verify `app/components/Header.tsx`: navigate tới `/mailbox/${mailboxId}/settings` vẫn đúng (index redirect sang general)

## Related Code Files

- Create: `app/routes/settings-ai.tsx`
- Delete: `app/routes/settings.tsx`
- Update: `plans/260606-0856-knowledge-base-rag-craft-context/phase-04-frontend-settings-ui.md`
- Verify: `app/components/Header.tsx`

## Implementation Steps

1. **Tạo `app/routes/settings-ai.tsx`**:
   - Copy phần AI Agent Prompt, Proactive AI, Automation Rules từ `settings.tsx`
   - Adjust `handleSave` để chỉ save AI fields
   - Adjust `useEffect` sync để chỉ sync AI fields

2. **Kiểm tra LOC**: `wc -l app/routes/settings-ai.tsx` — phải < 200
   - Nếu > 200: extract `AutomationRulesSection` thành `app/components/settings/automation-rules-settings-section.tsx`

3. **Verify Header.tsx**: `isSettingsActive` check `location.pathname.includes("/settings")` → vẫn đúng. Navigate `/settings` → index redirect sang `general` → OK.

4. **Update KB plan phase-04**:
   - Đổi `app/routes/settings.tsx` → `app/routes/settings-ai.tsx` trong Related Code Files
   - Đổi Integration step target

5. **Delete `app/routes/settings.tsx`**

6. **Chạy `npx tsc --noEmit`** — kiểm tra không có dangling import nào

7. **Chạy `npm run build`** (nếu có) để verify full build

## Success Criteria

- [ ] AI Agent Prompt: edit, save, reset-to-default hoạt động
- [ ] Proactive AI: unansweredDays, digest enable/disable, digestTime save hoạt động
- [ ] Automation Rules: list/create/delete/enable-toggle hoạt động
- [ ] `settings-ai.tsx` < 200 LOC
- [ ] `settings.tsx` đã bị delete, không còn import nào trỏ tới nó
- [ ] KB plan phase-04 updated với target file đúng
- [ ] Header.tsx gear icon → `/settings` → redirect sang `general` → đúng
- [ ] `npx tsc --noEmit` pass

## Risk Assessment

- Nếu `settings-ai.tsx` > 200 LOC (Automation Rules section ~80 LOC): extract RuleBuilder + list ra `AutomationRulesSettingsSection` component.
- `PROMPT_PLACEHOLDER` constant hiện define trong `settings.tsx` — cần move vào `settings-ai.tsx`.
- Verify không import nào còn trỏ tới `settings.tsx` sau khi delete (`grep -r "routes/settings" app/`).

## Security Considerations

- `agentSystemPrompt` không cần sanitize ở frontend (backend xử lý). Giữ behavior hiện tại.
