---
phase: 5
title: "Orders Panel and Frontend Integration"
status: completed
priority: P1
effort: "3h"
dependencies: [2, 4]
---

# Phase 5: Orders Panel and Frontend Integration

## Overview

Create a reusable WooCommerce orders panel component and integrate it into both ContactIntelligencePanel and EmailPanel. Add the TanStack Query hook for fetching orders.

## Requirements

- Functional: display orders with status badge, line items, payment, shipping, tracking link; shown in both Contact Intelligence and Email panels
- Non-functional: loading/empty/error states, compact design matching kumo design tokens

## Related Code Files

- Create: `app/components/woocommerce-orders-panel.tsx` — reusable orders display
- Create: `app/queries/woocommerce-orders-query.ts` — TanStack Query hook
- Modify: `app/queries/keys.ts` — add `woocommerceOrders` key factory
- Modify: `app/components/ContactIntelligencePanel.tsx` — embed orders panel
- Modify: `app/components/EmailPanel.tsx` — wire up ContactIntelligencePanel + embed orders panel after action items

## Implementation Steps

### 1. Add query key to `app/queries/keys.ts`

```typescript
woocommerceOrders: {
  list: (mailboxId: string, email: string) =>
    ["mailboxes", mailboxId, "woocommerce-orders", email] as const,
},
```

### 2. Create `app/queries/woocommerce-orders-query.ts`

```typescript
import { useQuery } from "@tanstack/react-query";
import api from "~/services/api";
import type { WooCommerceOrder } from "~/types";
import { queryKeys } from "./keys";

export function useWooCommerceOrders(mailboxId?: string, contactEmail?: string) {
  return useQuery<{ orders: WooCommerceOrder[] }>({
    queryKey: mailboxId && contactEmail
      ? queryKeys.woocommerceOrders.list(mailboxId, contactEmail)
      : ["woocommerce-orders", "_disabled"],
    queryFn: () => api.getWooOrders(mailboxId!, contactEmail!),
    enabled: !!mailboxId && !!contactEmail,
    staleTime: 15 * 60 * 1000, // 15 min — matches backend cache TTL
  });
}
```

### 3. Create `app/components/woocommerce-orders-panel.tsx`

Reusable component that renders a list of orders:

```typescript
interface WooCommerceOrdersPanelProps {
  mailboxId?: string;
  contactEmail?: string;
}
```

Layout per order:
```
┌─────────────────────────────────────┐
│ #1042 · Processing · $149.00       │
│ 2026-06-01                         │
│  ├─ Widget Pro ×2                  │
│  └─ Cable Kit ×1                   │
│ Payment: Stripe · Ship: Express    │
│ 📦 GHN: ABCD1234                   │
│    → https://tracking.link/...     │
└─────────────────────────────────────┘
```

Design details:
- Container: `rounded-lg border border-kumo-line bg-kumo-subtle p-3`
- Header: `🛒 WooCommerce Orders ({count})` or text "Customer Orders"
- Status badges: color-coded (green=completed, yellow=processing, red=cancelled/failed, gray=other)
- Line items: indented list with name × quantity
- Tracking: link to tracking URL if available
- States: loading spinner, "No orders found", error message
- Collapsible: show first 3 orders, "Show all" button to expand

### 4. Integrate into `app/components/ContactIntelligencePanel.tsx`

Add after the "Top topics" section:

```tsx
import WooCommerceOrdersPanel from "~/components/woocommerce-orders-panel";

// Inside the component, after topics:
<WooCommerceOrdersPanel mailboxId={mailboxId} contactEmail={contactEmail} />
```

Pass `mailboxId` as a new prop to `ContactIntelligencePanel`:
```typescript
interface ContactIntelligencePanelProps {
  intelligence: ContactIntelligence;
  contactEmail: string;
  mailboxId?: string;  // new
}
```

### 5. Wire up ContactIntelligencePanel + orders in `app/components/EmailPanel.tsx`

**Validation finding:** ContactIntelligencePanel exists but is not rendered anywhere. Wire it up here alongside the orders panel.

Add after the action items section (line ~201), before `EmailPanelHeader`:

```tsx
import WooCommerceOrdersPanel from "~/components/woocommerce-orders-panel";
import ContactIntelligencePanel from "~/components/ContactIntelligencePanel";
import { useContactIntelligence } from "~/queries/contact-intelligence-query";

// Inside component, derive sender email (already clean lowercase from DB):
const senderEmail = email.sender;
const { data: contactIntelligence } = useContactIntelligence(mailboxId, senderEmail);

// After action items div, before EmailPanelHeader:
{(contactIntelligence || true) && (
  <div className="px-5 py-3 border-b border-kumo-line space-y-3">
    {contactIntelligence && (
      <ContactIntelligencePanel
        intelligence={contactIntelligence}
        contactEmail={senderEmail}
        mailboxId={mailboxId}
      />
    )}
    <WooCommerceOrdersPanel mailboxId={mailboxId} contactEmail={senderEmail} />
  </div>
)}
```

Both panels self-manage their queries — if WooCommerce isn't configured, the backend returns `[]` and the orders panel renders nothing. ContactIntelligence shows when data is available.

**Note:** `email.sender` is already a clean lowercase email address (extracted via `PostalMime.from.address` during ingestion). No additional parsing needed.

## Success Criteria

- [ ] `useWooCommerceOrders` hook fetches orders with 15-min staleTime
- [ ] `woocommerce-orders-panel.tsx` renders order list with status, items, payment, tracking
- [ ] Panel shows in ContactIntelligencePanel when viewing a contact
- [ ] ContactIntelligencePanel rendered in EmailPanel when contact data available
- [ ] Orders panel shows in EmailPanel below contact intelligence when viewing an email
- [ ] Loading, empty, and error states handled
- [ ] Panel hidden when WooCommerce not configured (empty response)
- [ ] Status badges color-coded by order status
- [ ] Tracking links clickable (open in new tab)
- [ ] `npm run typecheck` passes

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| ContactIntelligencePanel not rendered anywhere yet | Wired up in EmailPanel alongside orders panel (validated: user confirmed this approach) |
| EmailPanel already complex | Orders panel is self-contained; only 3 lines added to EmailPanel |
| Many orders slow render | Default show 3, expand on click; backend caps at 20 |
