---
phase: 4
title: "Settings UI"
status: completed
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 4: Settings UI

## Overview

Add a WooCommerce configuration section to the mailbox settings page. Users enter store URL, consumer key, and consumer secret. Includes a "Test Connection" button.

## Requirements

- Functional: configure WooCommerce credentials per mailbox, test connection, persist in settings
- Non-functional: credentials shown as password fields, consistent with existing Telegram/Discord UI pattern

## Related Code Files

- Modify: `app/routes/settings.tsx` — add WooCommerce section
- Modify: `app/services/api.ts` — add `testWooCommerce()` and `getWooOrders()` methods

## Implementation Steps

### 1. Add API methods to `app/services/api.ts`

```typescript
// WooCommerce
testWooCommerce: (mailboxId: string, settings: { storeUrl: string; consumerKey: string; consumerSecret: string }) =>
  post<{ success: boolean; error?: string }>(`/api/v1/mailboxes/${mailboxId}/woocommerce/test`, settings),

getWooOrders: (mailboxId: string, email: string) =>
  get<{ orders: WooCommerceOrder[] }>(`/api/v1/mailboxes/${mailboxId}/woocommerce/orders`, { params: { email } }),
```

Import `WooCommerceOrder` from `~/types`.

### 2. Add WooCommerce section to `app/routes/settings.tsx`

Add state variables (following Telegram pattern):
```typescript
const [wooEnabled, setWooEnabled] = useState(false);
const [wooStoreUrl, setWooStoreUrl] = useState("");
const [wooConsumerKey, setWooConsumerKey] = useState("");
const [wooConsumerSecret, setWooConsumerSecret] = useState("");
const [testingWoo, setTestingWoo] = useState(false);
```

Initialize from `mailbox.settings?.woocommerce` in the `useEffect` block.

Save in `handleSave` — add to settings object:
```typescript
woocommerce: {
  enabled: wooEnabled,
  storeUrl: wooStoreUrl,
  consumerKey: wooConsumerKey,
  consumerSecret: wooConsumerSecret,
},
```

UI section (place after Notifications, before Proactive AI):
```tsx
{/* WooCommerce */}
<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
  <div className="flex items-center justify-between mb-3">
    <div className="flex items-center gap-2">
      <ShoppingCartIcon size={16} weight="duotone" className="text-kumo-subtle" />
      <span className="text-sm font-medium text-kumo-default">WooCommerce</span>
    </div>
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={wooEnabled} onChange={(e) => setWooEnabled(e.target.checked)} className="w-4 h-4 accent-blue-500" />
      <span className="text-xs text-kumo-subtle">Enabled</span>
    </label>
  </div>
  <p className="text-xs text-kumo-subtle mb-4">
    Connect your WooCommerce store to see customer orders while handling emails.
  </p>
  <div className="space-y-2">
    <Input label="Store URL" value={wooStoreUrl} onChange={(e) => setWooStoreUrl(e.target.value)} placeholder="https://shop.example.com" />
    <Input label="Consumer Key" type="password" value={wooConsumerKey} onChange={(e) => setWooConsumerKey(e.target.value)} placeholder="ck_..." />
    <Input label="Consumer Secret" type="password" value={wooConsumerSecret} onChange={(e) => setWooConsumerSecret(e.target.value)} placeholder="cs_..." />
  </div>
  <div className="mt-3">
    <Button variant="secondary" size="sm" onClick={handleTestWoo} loading={testingWoo} disabled={!wooStoreUrl || !wooConsumerKey || !wooConsumerSecret}>
      Test Connection
    </Button>
  </div>
</div>
```

Import `ShoppingCartIcon` from `@phosphor-icons/react` (or use `Package` icon if ShoppingCart not available).

Add test handler:
```typescript
const handleTestWoo = async () => {
  if (!mailboxId) return;
  setTestingWoo(true);
  try {
    const result = await api.testWooCommerce(mailboxId, {
      storeUrl: wooStoreUrl,
      consumerKey: wooConsumerKey,
      consumerSecret: wooConsumerSecret,
    });
    if (result.success) {
      toastManager.add({ title: "WooCommerce connection successful!" });
    } else {
      toastManager.add({ title: `WooCommerce test failed: ${result.error}`, variant: "error" });
    }
  } catch {
    toastManager.add({ title: "WooCommerce test request failed", variant: "error" });
  } finally {
    setTestingWoo(false);
  }
};
```

## Success Criteria

- [ ] WooCommerce section renders in Settings with enable toggle
- [ ] Store URL, Consumer Key, Consumer Secret inputs work
- [ ] "Test Connection" calls backend and shows success/error toast
- [ ] Settings save WooCommerce config to mailbox settings
- [ ] Settings load existing WooCommerce config on page open
- [ ] `npm run typecheck` passes

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| `ShoppingCartIcon` not in phosphor-icons | Check available icons; fallback to `Package` or `Storefront` |
| Settings page getting long (600+ lines) | Phase 6 will evaluate modularization if needed |
