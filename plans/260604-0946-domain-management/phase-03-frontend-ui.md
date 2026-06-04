---
phase: 3
title: "Frontend UI"
status: pending
effort: "1h"
dependencies: [2]
---

# Phase 3: Frontend UI

## Overview

Cập nhật trang `/domains` để hiển thị source badge (`env` / `custom`), nút delete (chỉ domain `custom`), và form "Add Domain" (chỉ admin thấy).

## Architecture

### UI layout

```
┌─────────────────────────────────────────────────────────┐
│ Domains                              [+ Add Domain]      │
│ Connected domains and their mailbox counts.              │
├─────────────────────────────────────────────────────────┤
│ 🌐 aloprints.com    [env]              1 mailbox    →   │
│ 🌐 ezcustomcar.com  [env]              1 mailbox    →   │
│ 🌐 newdomain.com    [custom]  [🗑]     0 mailboxes  →   │
└─────────────────────────────────────────────────────────┘

Dialog: Add Domain
┌─────────────────────────────┐
│ Domain name                 │
│ [newdomain.com            ] │
│ [Cancel]  [Add Domain]      │
└─────────────────────────────┘
```

### State changes

- `domains` từ API giờ là `DomainInfo[]` thay vì `string[]`
- Admin check: `session?.user?.role === "admin"`
- Optimistic update: invalidate `queryKeys.config` sau khi add/delete thành công

## Related Code Files

- Modify: `app/routes/domains.tsx` — main changes
- Modify: `app/queries/global-settings-query.ts` hoặc tạo query wrapper nếu cần

## Implementation Steps

### 1. Cập nhật `domains.tsx` — type + query

Đổi `domainRows` computation để dùng `DomainInfo`:

```tsx
const domainRows = useMemo(() => {
  const counts: Record<string, number> = {};
  for (const m of mailboxes) {
    const d = m.email.split("@")[1] ?? "unknown";
    counts[d] = (counts[d] ?? 0) + 1;
  }
  const configuredDomains = configData?.domains ?? [];  // DomainInfo[]
  const allDomains = Array.from(
    new Set([...configuredDomains.map((d) => d.domain), ...Object.keys(counts)])
  ).sort();

  return allDomains.map((domain) => {
    const info = configuredDomains.find((d) => d.domain === domain);
    return {
      domain,
      mailboxCount: counts[domain] ?? 0,
      isConfigured: !!info,
      source: info?.source ?? "custom",
    };
  });
}, [mailboxes, configData]);
```

### 2. Thêm state cho Add Domain dialog

```tsx
const [isAdding, setIsAdding] = useState(false);
const [newDomain, setNewDomain] = useState("");
const [addError, setAddError] = useState<string | null>(null);
const [isSaving, setIsSaving] = useState(false);
const queryClient = useQueryClient();
const isAdmin = session?.user?.role === "admin";

const handleAddDomain = async () => {
  if (!newDomain.trim()) return;
  setIsSaving(true);
  setAddError(null);
  try {
    await api.addDomain(newDomain.trim());
    queryClient.invalidateQueries({ queryKey: queryKeys.config });
    setIsAdding(false);
    setNewDomain("");
  } catch (e: any) {
    setAddError(e.message ?? "Failed to add domain");
  } finally {
    setIsSaving(false);
  }
};

const handleDeleteDomain = async (domain: string) => {
  if (!confirm(`Remove domain "${domain}"? Mailboxes under this domain remain intact.`)) return;
  try {
    await api.deleteDomain(domain);
    queryClient.invalidateQueries({ queryKey: queryKeys.config });
  } catch (e: any) {
    alert(e.message ?? "Failed to delete domain");
  }
};
```

### 3. Cập nhật header section — thêm "+ Add Domain" button

```tsx
<div className="px-6 lg:px-10 pt-8 pb-6 flex items-end justify-between gap-6 flex-wrap">
  <div>
    <h1 ...>Domains</h1>
    <p ...>...</p>
  </div>
  <div className="flex items-center gap-3">
    {/* stat chips */}
    {isAdmin && (
      <Button variant="primary" size="sm" icon={<PlusIcon size={14} />}
        onClick={() => setIsAdding(true)}>
        Add Domain
      </Button>
    )}
  </div>
</div>
```

### 4. Cập nhật domain row — source badge + delete button

```tsx
{domainRows.map((row) => (
  <div key={row.domain} className="flex items-center gap-4 px-5 py-4 border-b border-kumo-line last:border-0">
    {/* icon */}
    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
      <GlobeIcon size={20} className="text-indigo-400" />
    </div>

    {/* info */}
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-sm text-kumo-default">{row.domain}</span>
        {/* Source badge */}
        {row.source === "env" ? (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-kumo-fill text-kumo-subtle border border-kumo-line">
            env
          </span>
        ) : (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100">
            custom
          </span>
        )}
        {row.isConfigured && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-kumo-success text-white">
            <span className="w-1 h-1 rounded-full bg-white/70" />
            Configured
          </span>
        )}
      </div>
      <p className="text-xs text-kumo-subtle font-mono mt-0.5">{row.domain}</p>
    </div>

    {/* mailbox count */}
    <div className="text-right shrink-0">
      <span className="text-lg font-semibold text-kumo-default">{row.mailboxCount}</span>
      <p className="text-xs text-kumo-subtle">mailbox{row.mailboxCount !== 1 ? "es" : ""}</p>
    </div>

    {/* delete button — custom domains only, admin only */}
    {isAdmin && row.source === "custom" && (
      <button
        type="button"
        onClick={() => handleDeleteDomain(row.domain)}
        className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-kumo-subtle hover:bg-red-50 hover:text-red-500 transition-colors cursor-pointer"
        aria-label={`Remove ${row.domain}`}
      >
        <TrashIcon size={15} />
      </button>
    )}
  </div>
))}
```

### 5. Add Domain dialog

Dùng `Dialog` từ `@cloudflare/kumo` (đã có trong settings.tsx):

```tsx
<Dialog open={isAdding} onOpenChange={(o) => { setIsAdding(o); setNewDomain(""); setAddError(null); }}>
  <Dialog.Content title="Add Domain">
    <div className="space-y-4">
      <Input
        label="Domain name"
        placeholder="example.com"
        value={newDomain}
        onChange={(e) => setNewDomain(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleAddDomain()}
        autoFocus
      />
      {addError && <p className="text-sm text-kumo-danger">{addError}</p>}
      <p className="text-xs text-kumo-subtle">
        After adding, set up email routing for this domain in the Cloudflare dashboard.
      </p>
    </div>
    <Dialog.Footer>
      <Button variant="secondary" onClick={() => setIsAdding(false)}>Cancel</Button>
      <Button variant="primary" loading={isSaving}
        disabled={!newDomain.trim()}
        onClick={handleAddDomain}>
        Add Domain
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog>
```

### 6. Imports cần thêm vào `domains.tsx`

```tsx
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, Input } from "@cloudflare/kumo";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
```

## Success Criteria

- [ ] Domain list hiển thị `env` / `custom` badge cho từng domain
- [ ] Nút "+ Add Domain" chỉ visible cho admin
- [ ] Form dialog validate + submit thành công, list tự refresh
- [ ] Nút delete chỉ hiện với `custom` domain và admin
- [ ] Confirm dialog trước khi xóa
- [ ] Error message hiển thị khi add trùng domain

## Risk Assessment

- **`queryKeys.config`** — verify key path đúng trong `app/queries/keys.ts` trước khi dùng `invalidateQueries`
- **Dialog API** — verify kumo `Dialog` component API pattern từ `settings.tsx` (đã dùng ở đó)
- **`api.deleteDomain`** — cần có `delete` HTTP helper trong `api.ts`; nếu chưa có thì add
