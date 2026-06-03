---
phase: 3
title: 'Frontend: Simplify Per-mailbox Settings'
status: completed
priority: P2
effort: 30min
dependencies:
  - 2
---

# Phase 3: Frontend: Simplify Per-mailbox Settings

## Overview

Remove the Notifications section from `app/routes/settings.tsx`. Delete all related state, handlers, and JSX. Also remove notifications from the `handleSave` payload so it no longer overwrites the field in R2.

## Related Code Files

- Modify: `app/routes/settings.tsx`

## Implementation Steps

### 1. Remove notification state variables (lines ~42–49)

Delete:
```typescript
const [telegramEnabled, setTelegramEnabled] = useState(false);
const [telegramBotToken, setTelegramBotToken] = useState("");
const [telegramChatId, setTelegramChatId] = useState("");
const [telegramTopicId, setTelegramTopicId] = useState("");
const [discordEnabled, setDiscordEnabled] = useState(false);
const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
const [testingTelegram, setTestingTelegram] = useState(false);
const [testingDiscord, setTestingDiscord] = useState(false);
```

### 2. Remove notification initialization in `useEffect` (lines ~94–100)

Delete:
```typescript
const n = mailbox.settings?.notifications;
setTelegramEnabled(n?.telegram?.enabled ?? false);
setTelegramBotToken(n?.telegram?.botToken ?? "");
setTelegramChatId(n?.telegram?.chatId ?? "");
setTelegramTopicId(n?.telegram?.topicId ?? "");
setDiscordEnabled(n?.discord?.enabled ?? false);
setDiscordWebhookUrl(n?.discord?.webhookUrl ?? "");
```

### 3. Remove notifications from `handleSave` (lines ~127–130)

Delete the `notifications` key from the settings object:
```typescript
// Remove this block:
notifications: {
  telegram: { enabled: telegramEnabled, botToken: telegramBotToken, chatId: telegramChatId, topicId: telegramTopicId || undefined },
  discord: { enabled: discordEnabled, webhookUrl: discordWebhookUrl },
},
```

### 4. Remove test handlers (lines ~153–185)

Delete `handleTestTelegram` and `handleTestDiscord` functions entirely.

### 5. Remove Notifications JSX section (lines ~216–307)

Delete the entire `{/* Notifications */}` block including the outer `<div>`, both the Telegram and Discord sub-blocks, and all children.

### 6. Remove unused imports

Check `api` import — if `api.testNotification` was the only usage of `api` in this file, remove the import. Otherwise keep.

Also check `BellIcon` — if only used in the Notifications section, remove from imports.

## Success Criteria

- [ ] `settings.tsx` has no notification state variables
- [ ] `settings.tsx` has no `handleTestTelegram` / `handleTestDiscord`
- [ ] `settings.tsx` has no Notifications JSX section
- [ ] `handleSave` no longer writes a `notifications` key
- [ ] No unused imports remain (no TS warnings)
- [ ] `tsc` passes, no type errors
- [ ] Per-mailbox settings page still renders correctly (Account, WooCommerce, Proactive AI, Signature, Agent Prompt, Labels, Templates, Rules sections intact)

## Risk Assessment

- Low risk — purely additive removal, no logic changes.
- Verify `api` import: `api.testNotification` is called only in the two test handlers. After removal, check if `api` is used elsewhere in `settings.tsx`; if not, remove the import to avoid lint warnings.
