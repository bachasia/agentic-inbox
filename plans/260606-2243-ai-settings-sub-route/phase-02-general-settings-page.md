---
phase: 2
title: "General Settings Page"
status: pending
priority: P2
effort: "1.5h"
dependencies: [1]
---

# Phase 2: General Settings Page

## Overview

Tạo `settings-general.tsx` chứa: Account, WooCommerce, Signature, Labels, Email Templates. Extract từ `settings.tsx` hiện tại. Save button chỉ save `fromName`, `signature`, `woocommerce`.

## Requirements

- Functional: tất cả sections từ `settings.tsx` không liên quan AI đều hoạt động đúng
- Functional: Save button save `fromName`, `signature`, `woocommerce` (không save AI settings)
- Non-functional: file < 200 LOC
- Non-functional: Labels và Templates dùng individual mutations (không qua Save button)

## Architecture

### Content split

Từ `settings.tsx`, chuyển sang `settings-general.tsx`:
- **Account section**: `displayName` state, Input Display Name + Email disabled
- **WooCommerce section**: `<WooCommerceSettingsSection>` component (self-contained)
- **Signature section**: `signatureEnabled`, `signatureHtml`, RichTextEditor + preview
- **Labels section**: `useLabels`, `useCreateLabel`, `useDeleteLabel` mutations
- **Email Templates section**: `useTemplates`, `useCreateTemplate`, `useUpdateTemplate`, `useDeleteTemplate` mutations (thêm edit UI)
- **Save button**: chỉ save `fromName`, `signature`, `woocommerce`

### State cần giữ

```ts
const [displayName, setDisplayName] = useState("");
const [signatureEnabled, setSignatureEnabled] = useState(false);
const [signatureHtml, setSignatureHtml] = useState("");
const [wooSettings, setWooSettings] = useState<WooCommerceSettings>({...});
```

### handleSave trong settings-general.tsx

```ts
const settings = {
  ...mailbox.settings,
  fromName: displayName,
  signature: { enabled: signatureEnabled, html: signatureHtml, text: htmlToPlainText(signatureHtml) },
  woocommerce: wooSettings,
};
await updateMailboxMutation.mutateAsync({ mailboxId, settings });
```

**Lưu ý:** `...mailbox.settings` spread đảm bảo AI settings (`agentSystemPrompt`, `unansweredDays`, etc.) không bị overwrite khi save General.

## Related Code Files

- Create: `app/routes/settings-general.tsx`
- Read: `app/routes/settings.tsx` (extract relevant sections)
- Read: `app/components/settings/woocommerce-settings-section.tsx`

## Implementation Steps

1. **Tạo `app/routes/settings-general.tsx`**:
   - Copy phần Account, WooCommerce, Signature, Labels, Templates từ `settings.tsx`
   - Adjust `handleSave` để chỉ save general fields
   - Giữ `useEffect` sync từ `mailbox` data (chỉ sync general fields)

2. **Thêm edit template UI**: thêm "Edit" button per template, show pre-filled form (tương tự New template form nhưng điền sẵn giá trị), call `updateTemplateMut.mutate({ id, name, subject, body })`

3. **Kiểm tra imports**: đảm bảo không import gì liên quan AI (RobotIcon, agentPrompt, rules, etc.)

4. **Kiểm tra LOC**: `wc -l app/routes/settings-general.tsx` — phải < 200. Nếu > 200: extract Templates thành `template-settings-section.tsx`

5. **Chạy `npx tsc --noEmit`**

## Success Criteria

- [ ] Account section: Display Name save hoạt động
- [ ] Signature section: enable/disable, edit, preview hoạt động
- [ ] WooCommerce section: render đúng
- [ ] Labels: add/delete hoạt động
- [ ] Templates: create/edit/delete hoạt động
- [ ] Save không overwrite AI settings (spread `...mailbox.settings` trước)
- [ ] `settings-general.tsx` < 200 LOC
- [ ] `npx tsc --noEmit` pass

## Risk Assessment

- Spread `...mailbox.settings` là critical — thiếu sẽ overwrite AI settings khi save General. Double-check trong handleSave.
- WooCommerceSettingsSection dùng `onChange` callback — đảm bảo state `wooSettings` vẫn được set đúng.
