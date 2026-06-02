---
phase: 1
title: "Notification Backend Service"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Notification Backend Service

## Overview

Create `workers/lib/notifications.ts` — a standalone module that sends notifications to Telegram and/or Discord. Stateless functions that take mailbox notification settings + email metadata, fire HTTP POSTs to external APIs. Used by the inbound email handler (Phase 3).

## Requirements

- Functional: Send formatted notification to Telegram Bot API and/or Discord webhook when called with email metadata
- Functional: Each provider is independent — if Telegram fails, Discord still fires (and vice versa)
- Functional: Include sender and subject in the notification body (no email body content — privacy decision: email content stays on Cloudflare)
- Non-functional: Non-blocking — callers use `waitUntil()` so email storage is never delayed
- Non-functional: Fail silently with `console.error` — notification failure must never block email delivery

## Architecture

```
notifyNewEmail(settings, emailMeta)
  ├── settings.telegram?.enabled → sendTelegramNotification()
  │     POST https://api.telegram.org/bot{token}/sendMessage
  │     { chat_id, text, parse_mode: "HTML" }
  │
  └── settings.discord?.enabled → sendDiscordNotification()
        POST {webhookUrl}
        { embeds: [{ title, description, color, fields }] }
```

## Related Code Files

- Create: `workers/lib/notifications.ts`
- Modify: `app/types/index.ts` — add `NotificationSettings` to `MailboxSettings`
- Modify: `workers/index.ts` — update `CreateMailboxBody` default settings to include notification defaults

## Implementation Steps

1. **Add notification types to `app/types/index.ts`:**
   ```ts
   export interface TelegramSettings {
     enabled: boolean;
     botToken: string;
     chatId: string;
   }

   export interface DiscordSettings {
     enabled: boolean;
     webhookUrl: string;
   }

   export interface NotificationSettings {
     telegram?: TelegramSettings;
     discord?: DiscordSettings;
   }
   ```
   Add `notifications?: NotificationSettings` to `MailboxSettings`.

2. **Create `workers/lib/notifications.ts`:**
   - `sendTelegramNotification(token, chatId, emailMeta)` — POST to `https://api.telegram.org/bot${token}/sendMessage` with HTML-formatted message (sender + subject only, no body snippet). Escape HTML entities in user content.
   - `sendDiscordNotification(webhookUrl, emailMeta)` — POST to webhook URL with embed (title = subject, fields = [sender, mailbox], color = 0x3B82F6 blue). No body content.
   - `notifyNewEmail(settings, emailMeta)` — orchestrator that checks which providers are enabled and fires them in parallel via `Promise.allSettled()`. Logs errors but never throws.
   - `testNotification(provider, providerSettings)` — sends a test message for a specific provider. Accepts provider settings directly from request body (test from form state, not saved settings). Returns `{ success: boolean; error?: string }`.

3. **Define `EmailNotificationMeta` type** in `workers/lib/notifications.ts` (used by Phase 3):
   ```ts
   export interface EmailNotificationMeta {
     sender: string;
     senderName?: string;
     subject: string;
     mailboxId: string;
   }
   ```

4. **Update default mailbox settings in `workers/index.ts`:**
   - Add `notifications: { telegram: { enabled: false, botToken: "", chatId: "" }, discord: { enabled: false, webhookUrl: "" } }` to `defaultSettings` in the `POST /mailboxes` handler.

5. **Run typecheck** to verify no compile errors.

## Success Criteria

- [ ] `workers/lib/notifications.ts` exports `notifyNewEmail()` and `testNotification()`
- [ ] `NotificationSettings` type added to `MailboxSettings` interface
- [ ] Telegram function sends HTML-formatted POST to Bot API with proper escaping
- [ ] Discord function sends embed POST to webhook URL
- [ ] `Promise.allSettled()` ensures one provider failure doesn't block the other
- [ ] Default mailbox creation includes notification defaults (all disabled)
- [ ] `npm run typecheck` passes

## Risk Assessment

- **Telegram Bot API rate limits:** 30 msgs/sec per bot — far above personal use. No mitigation needed.
- **Discord webhook rate limits:** 30 reqs/min per webhook — sufficient for personal email. Log if 429 received.
- **Security:** Bot tokens and webhook URLs stored in R2 mailbox JSON. Not ideal for secrets, but acceptable for a single-user self-hosted app behind Cloudflare Access. Future: encrypt at rest with Worker-level key.
