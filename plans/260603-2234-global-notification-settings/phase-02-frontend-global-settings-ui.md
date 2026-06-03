---
phase: 2
title: 'Frontend: Global Settings UI'
status: completed
priority: P2
effort: 3h
dependencies:
  - 1
---

# Phase 2: Frontend: Global Settings UI

## Overview

Add `GlobalSettings` type to `app/types/index.ts`, add API client functions and TanStack Query hooks, then build the Notifications section in `global-settings.tsx`. The section shows global credentials (botToken, chatId, webhookUrl) + a per-store table (toggle + topicId per mailbox).

## Architecture

### UI layout for Notifications section

```
┌─ Notifications ─────────────────────────────────────────────────────┐
│                                                                       │
│  ┌─ Telegram ──────────────────────────────────────────────────────┐ │
│  │  Bot Token: [____________________________]                       │ │
│  │  Chat ID:   [____________________________]  [Send Test]          │ │
│  │                                                                   │ │
│  │  Per-store routing:                                               │ │
│  │  ┌───────────────────────────────────────────────────────────┐   │ │
│  │  │ store@bach.asia    [✓ Enabled]  Topic ID: [123        ]   │   │ │
│  │  │ store2@domain.com  [ Enabled]   Topic ID: [           ]   │   │ │
│  │  └───────────────────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌─ Discord ───────────────────────────────────────────────────────┐ │
│  │  Webhook URL: [____________________________]  [Send Test]        │ │
│  │                                                                   │ │
│  │  Per-store routing:                                               │ │
│  │  ┌───────────────────────────────────────────────────────────┐   │ │
│  │  │ store@bach.asia    [✓ Enabled]                            │   │ │
│  │  │ store2@domain.com  [ Enabled]                             │   │ │
│  │  └───────────────────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  [Save Notification Settings]                                         │
└───────────────────────────────────────────────────────────────────────┘
```

## Related Code Files

- Modify: `app/types/index.ts` — add `GlobalSettings`, `GlobalNotificationSettings`
- Modify: `app/services/api.ts` — add `getGlobalSettings`, `updateGlobalSettings`, `testGlobalNotification`
- Modify: `app/queries/keys.ts` — add `globalSettings` key
- Create: `app/queries/global-settings-query.ts` — TanStack Query hooks
- Create: `app/components/notifications-global-section.tsx` — extracted Notifications UI component
- Modify: `app/routes/global-settings.tsx` — import + conditionally render NotificationsGlobalSection (admin only)

## Implementation Steps

### 1. Add types to `app/types/index.ts`

```typescript
export interface GlobalStoreNotifConfig {
  enabled: boolean;
  topicId?: string;
}

export interface GlobalNotificationSettings {
  telegram?: {
    botToken: string;
    chatId: string;
    stores?: Record<string, GlobalStoreNotifConfig>;
  };
  discord?: {
    webhookUrl: string;
    stores?: Record<string, GlobalStoreNotifConfig>;
  };
}

export interface GlobalSettings {
  notifications?: GlobalNotificationSettings;
}
```

### 2. Add API functions to `app/services/api.ts`

```typescript
getGlobalSettings: () =>
  get<GlobalSettings>("/api/v1/settings"),

updateGlobalSettings: (settings: GlobalSettings) =>
  put<GlobalSettings>("/api/v1/settings", settings),

testGlobalNotification: (provider: "telegram" | "discord", settings: Record<string, string>) =>
  post<{ success: boolean; error?: string }>("/api/v1/settings/test-notification", { provider, settings }),
```

Check pattern: `get`, `put`, `post` are already used in the file — follow existing helpers.

### 3. Add query key to `app/queries/keys.ts`

```typescript
globalSettings: ["globalSettings"] as const,
```

### 4. Create `app/queries/global-settings-query.ts`

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import { queryKeys } from "./keys";
import type { GlobalSettings } from "~/types";

export function useGlobalSettings() {
  return useQuery<GlobalSettings>({
    queryKey: queryKeys.globalSettings,
    queryFn: () => api.getGlobalSettings(),
  });
}

export function useUpdateGlobalSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: GlobalSettings) => api.updateGlobalSettings(settings),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.globalSettings }),
  });
}
```

### 5. Create `app/components/notifications-global-section.tsx`

Extract all Notifications UI into a standalone component to keep `global-settings.tsx` under 200 lines. Component owns all local state for bot token, chat ID, webhook URL, per-store toggles/topic IDs, and loading states.

**Props interface:**
```typescript
interface NotificationsGlobalSectionProps {
  mailboxes: Mailbox[];
}
```

Component uses `useGlobalSettings`, `useUpdateGlobalSettings` internally. Uses `useKumoToastManager` for toast feedback.

**State:**
```typescript
const [tgBotToken, setTgBotToken] = useState("");
const [tgChatId, setTgChatId] = useState("");
const [dcWebhookUrl, setDcWebhookUrl] = useState("");
const [tgStores, setTgStores] = useState<Record<string, { enabled: boolean; topicId: string }>>({});
const [dcStores, setDcStores] = useState<Record<string, { enabled: boolean }>>({});
const [savingNotif, setSavingNotif] = useState(false);
const [testingTg, setTestingTg] = useState(false);
const [testingDc, setTestingDc] = useState(false);
```

**useEffect** syncs from `globalSettings` + `mailboxes` (same logic as originally planned). Key dependency: `[globalSettings, mailboxes]`.

**Save handler** builds `GlobalSettings` payload and calls `updateGlobalSettingsMut.mutateAsync()`.

**Test handlers** call `api.testGlobalNotification("telegram"|"discord", { ... })`.

**JSX structure:**
```
<section> (rounded-xl border, same style as other sections)
  Header: "Notifications" + subtitle
  Body:
    Telegram card:
      Bot Token input (type=password)
      Chat ID input + [Send Test] button (row)
      Per-store table: each mailbox row → email | [On checkbox] | [Topic ID input w-24]
    Discord card:
      Webhook URL input + [Send Test] button (row)
      Per-store table: each mailbox row → email | [On checkbox]
    [Save Notification Settings] button (right-aligned, primary)
</section>
```

### 6. Update `app/routes/global-settings.tsx`

**Add imports:**
```typescript
import NotificationsGlobalSection from "~/components/notifications-global-section";
```

**Conditional render** — only for admin users. Insert after the Account section:
```tsx
{session?.user?.role === "admin" && (
  <NotificationsGlobalSection mailboxes={mailboxes} />
)}
```

`session` is already available via `authClient.useSession()`. `mailboxes` is already fetched via `useMailboxes()`.

No additional state or imports needed in `global-settings.tsx` itself — all notification logic lives in the component.

## Success Criteria

- [ ] `app/components/notifications-global-section.tsx` created, <200 lines
- [ ] `useGlobalSettings` hook fetches from `GET /api/v1/settings`
- [ ] Notifications section visible only when `session.user.role === "admin"`
- [ ] Bot Token / Chat ID / Webhook URL inputs populate from saved data on load
- [ ] Per-store rows render for each mailbox with correct toggle + topicId state
- [ ] Save persists to `PUT /api/v1/settings`
- [ ] Send Test (Telegram) calls `POST /api/v1/settings/test-notification` with botToken + chatId
- [ ] Send Test (Discord) calls `POST /api/v1/settings/test-notification` with webhookUrl
- [ ] Toast on save success/failure + test success/failure
- [ ] `global-settings.tsx` stays under 200 lines
- [ ] `tsc` passes, no type errors

## Risk Assessment

- **`useKumoToastManager`**: Used inside `NotificationsGlobalSection` — import from `@cloudflare/kumo`. Follows pattern in `settings.tsx`.
- **`useMailboxes` in global-settings**: Already imported — pass as prop to component. Don't double-fetch.
- **Admin check**: `session?.user?.role === "admin"` — verify this is the correct role string by checking `admin.tsx` or auth setup. If role field name differs, adjust accordingly.
