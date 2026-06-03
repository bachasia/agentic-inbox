---
phase: 1
title: 'Backend: Global Settings API'
status: completed
priority: P2
effort: 2h
dependencies: []
---

# Phase 1: Backend: Global Settings API

## Overview

Add `GET/PUT /api/v1/settings` and `POST /api/v1/settings/test-notification` endpoints. Add `getEffectiveNotifications()` helper in `notifications.ts` that merges global credentials with per-mailbox store config, returning the existing `NotificationsConfig` shape. Update all 4 notification call sites across worker + Durable Object.

## Architecture

### New R2 key
`global-settings.json` — single JSON blob stored in `c.env.BUCKET`.

### Worker-side types (add to `notifications.ts`)

```typescript
interface GlobalStoreConfig {
  enabled: boolean;
  topicId?: string;
}
export interface GlobalSettings {
  notifications?: {
    telegram?: { botToken: string; chatId: string; stores?: Record<string, GlobalStoreConfig> };
    discord?: { webhookUrl: string; stores?: Record<string, GlobalStoreConfig> };
  };
}
```

### `getEffectiveNotifications` helper

Returns existing `NotificationsConfig` shape — all downstream send functions unchanged.

```typescript
export async function getEffectiveNotifications(
  bucket: R2Bucket,
  mailboxId: string
): Promise<NotificationsConfig | undefined> {
  const obj = await bucket.get("global-settings.json");
  if (!obj) return undefined;
  const g = await obj.json<GlobalSettings>();
  const tg = g.notifications?.telegram;
  const dc = g.notifications?.discord;
  return {
    telegram: tg?.botToken && tg?.chatId ? {
      enabled: tg.stores?.[mailboxId]?.enabled ?? false,
      botToken: tg.botToken,
      chatId: tg.chatId,
      topicId: tg.stores?.[mailboxId]?.topicId ?? undefined,
    } : undefined,
    discord: dc?.webhookUrl ? {
      enabled: dc.stores?.[mailboxId]?.enabled ?? false,
      webhookUrl: dc.webhookUrl,
    } : undefined,
  };
}
```

## Related Code Files

- Modify: `workers/lib/notifications.ts`
- Modify: `workers/index.ts`
- Modify: `workers/durableObject/index.ts`

## Implementation Steps

### 1. Add types + helper to `workers/lib/notifications.ts`

Add `GlobalStoreConfig` and `GlobalSettings` interfaces. Add `getEffectiveNotifications` export above `notifyNewEmail`.

### 2. Add 3 new routes to `workers/index.ts` (after ~line 192)

```typescript
app.get("/api/v1/settings", async (c) => {
  const obj = await c.env.BUCKET.get("global-settings.json");
  if (!obj) return c.json({});
  return c.json(await obj.json());
});

app.put("/api/v1/settings", requireAdmin, async (c) => {
  const body = await c.req.json();
  await c.env.BUCKET.put("global-settings.json", JSON.stringify(body));
  return c.json(body);
});

app.post("/api/v1/settings/test-notification", requireAdmin, async (c) => {
  const { provider, settings } = await c.req.json<{
    provider: "telegram" | "discord";
    settings: Record<string, string>;
  }>();
  return c.json(await testNotification(provider, settings));
});
```

Check: `requireAdmin` middleware already exists at line ~95. Use it for PUT + POST test.
GET can be open (no admin check needed — UI needs to read it).

### 3. Update call site in `workers/index.ts` (~line 1025)

```typescript
// Before:
notifyNewEmail(mailboxSettings.notifications, { mailboxId, ... })
  .catch(...)

// After:
getEffectiveNotifications(c.env.BUCKET, mailboxId)
  .then(n => notifyNewEmail(n, { mailboxId, ... }))
  .catch((e: Error) => logger.error("notifications", "Notification failed", { error: e }))
```

### 4. Update 3 call sites in `workers/durableObject/index.ts`

**Line ~1063** (sendReminderNotification):
```typescript
const notifConfig = await getEffectiveNotifications(this.env.BUCKET, mailboxId);
await sendReminderNotification(notifConfig, { ... });
```

**Line ~1080** (sendDigestNotification):
```typescript
const notifConfig = await getEffectiveNotifications(this.env.BUCKET, mailboxId);
await sendDigestNotification(notifConfig, data, summary);
```

**Line ~1645** (notifyNewEmail in DO — uses `env` not `this.env`):
```typescript
const notifConfig = await getEffectiveNotifications(env.BUCKET, mailboxId);
await notifyNewEmail(notifConfig, { mailboxId, ... });
```

### 5. Add import in `workers/durableObject/index.ts`

Add `getEffectiveNotifications` to the import from `../lib/notifications`.

## Success Criteria

- [ ] `GET /api/v1/settings` returns `{}` when not set, JSON blob when set
- [ ] `PUT /api/v1/settings` writes to R2 `global-settings.json`, returns saved body
- [ ] `POST /api/v1/settings/test-notification` sends Telegram/Discord test using provided credentials
- [ ] `getEffectiveNotifications` returns `undefined` when `global-settings.json` absent
- [ ] `getEffectiveNotifications` returns correct merged config (credentials + per-store enabled/topicId)
- [ ] All 4 notification call sites updated
- [ ] `npm run build` / `tsc` passes with no type errors

## Risk Assessment

- **DO env reference**: Line ~1645 uses `env` (closure param), lines ~1063/1080 use `this.env`. Verify at each call site before writing.
- **`requireAdmin` vs open for GET**: GET `/api/v1/settings` should be accessible to all authenticated users since the Global Settings page is visible to all. Only PUT/POST need admin restriction — adjust if the app is single-user.
- **R2 extra read per notification**: `getEffectiveNotifications` adds one R2 `get` per notification event. Fire-and-forget path — acceptable latency tradeoff.
