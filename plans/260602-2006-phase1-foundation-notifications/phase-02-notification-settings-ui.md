---
phase: 2
title: "Notification Settings UI"
status: pending
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Notification Settings UI

## Overview

Add a "Notifications" section to the mailbox settings page with Telegram and Discord configuration. Each provider has enable toggle, credential fields, and a "Test" button that fires a test notification and shows success/failure feedback.

## Requirements

- Functional: Telegram config: toggle, bot token input, chat ID input
- Functional: Discord config: toggle, webhook URL input
- Functional: "Test" button per provider — fires test notification and shows toast result
- Functional: Settings persist via existing `PUT /mailboxes/:id` endpoint (R2 JSON)
- Non-functional: Consistent with existing settings page patterns (Kumo Input, Button, Badge components)

## Architecture

```
settings.tsx
  ├── Account section (existing)
  ├── Notifications section (NEW)
  │     ├── Telegram card: toggle + botToken + chatId + Test button
  │     └── Discord card: toggle + webhookUrl + Test button
  ├── AI Agent Prompt section (existing)
  └── Save button (existing — saves all sections at once)
```

New backend endpoint:
```
POST /api/v1/mailboxes/:mailboxId/test-notification
Body: { provider: "telegram" | "discord", settings: { botToken, chatId } | { webhookUrl } }
→ Tests from form state (no R2 read), calls testNotification() with provided settings
```

## Related Code Files

- Modify: `app/routes/settings.tsx` — add Notifications section with toggle + fields + test buttons
- Modify: `workers/index.ts` — add `POST /test-notification` endpoint
- Read: `app/types/index.ts` — uses `NotificationSettings` from Phase 1

## Implementation Steps

1. **Add test notification endpoint in `workers/index.ts`:**
   ```ts
   app.post("/api/v1/mailboxes/:mailboxId/test-notification", async (c: AppContext) => {
     const { provider, settings } = await c.req.json() as {
       provider: "telegram" | "discord";
       settings: Record<string, string>;
     };
     const result = await testNotification(provider, settings);
     return c.json(result);
   });
   ```
   Tests from form state directly — no R2 read needed. User can test before saving.

2. **Add `testNotification` to `app/services/api.ts`:**
   ```ts
   testNotification: (mailboxId: string, provider: string, settings: Record<string, string>) =>
     request(`/api/v1/mailboxes/${mailboxId}/test-notification`, {
       method: "POST",
       body: JSON.stringify({ provider, settings }),
     })
   ```

3. **Extend `app/routes/settings.tsx`:**
   - Add state for notification fields: `telegramEnabled`, `telegramBotToken`, `telegramChatId`, `discordEnabled`, `discordWebhookUrl`
   - Initialize from `mailbox.settings.notifications` in the existing `useEffect`
   - Add a Notifications section between Account and AI Agent Prompt sections
   - Each provider gets a card with:
     - Toggle (checkbox/switch) for enabled
     - Credential inputs (type="password" for tokens, type="url" for webhook)
     - "Send Test" button with loading state
   - Test button handler: calls `api.testNotification(mailboxId, provider, currentFormSettings)`, shows toast on success/error. Sends form state directly — no save required.
   - Save handler: include `notifications` in the settings object passed to `updateMailboxMutation`

4. **Run typecheck + dev server** to verify UI renders correctly.

## Success Criteria

- [ ] Notifications section visible in settings page between Account and AI Agent Prompt
- [ ] Telegram fields: enable toggle, bot token (masked input), chat ID
- [ ] Discord fields: enable toggle, webhook URL
- [ ] Test button sends test notification and shows toast (green success / red error)
- [ ] Settings save persists notification config to R2
- [ ] Settings load pre-fills notification config from R2
- [ ] `POST /test-notification` endpoint works and returns `{ success, error? }`
- [ ] `npm run typecheck` passes

## Risk Assessment

- **Credentials visible in settings JSON:** Acceptable for single-user self-hosted. Bot tokens shown as password inputs in UI.
- **Test button sends credentials over network:** The test endpoint receives bot tokens/webhook URLs in the request body. Acceptable — traffic is same-origin HTTPS behind Cloudflare Access. No different from the save endpoint.
