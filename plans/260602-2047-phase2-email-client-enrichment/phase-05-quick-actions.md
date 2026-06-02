---
phase: 5
title: "Quick Actions"
status: complete
priority: P2
effort: "2h"
dependencies: [phase-02-labels-full-stack, phase-03-snooze-scheduled-send]
---

# Phase 5: Quick Actions

## Overview

Frontend-only phase. Adds Gmail-style keyboard shortcuts and mobile swipe gestures for the most frequent email actions. No new API endpoints or DB changes — all bindings call existing mutations.

## Requirements

- Functional:
  - Keyboard shortcuts (active when email list or email panel is focused, inactive inside TipTap editor):
    - `j` / `k` — next / previous email
    - `e` — archive selected email (move to Archive folder)
    - `#` — delete selected email (move to Trash)
    - `r` — reply to selected email
    - `f` — forward selected email
    - `s` — toggle star on selected email
    - `u` — mark unread
    - `c` — compose new email
    - `/` — focus search input
    - `?` — open keyboard shortcuts help modal
    - `Escape` — close panel / modal
  - Mobile swipe gestures on email list rows:
    - Swipe right → archive
    - Swipe left → delete (with confirmation)
  - Keyboard shortcut help modal (`?`): shows all shortcuts in a simple table
- Non-functional:
  - Shortcuts must be disabled when any `<input>`, `<textarea>`, or `.ProseMirror` element is focused
  - No new dependencies — use native browser events + existing Zustand store

## Architecture

```
Frontend only
  app/hooks/useKeyboardShortcuts.ts   ← global keydown handler, registered in mailbox layout
  app/components/ShortcutsHelpModal.tsx  ← table of all shortcuts, toggled by ?
  app/components/SwipeableEmailRow.tsx   ← wraps email list row with touch handlers
  app/routes/mailbox.tsx              ← mount useKeyboardShortcuts
  app/routes/email-list.tsx           ← use SwipeableEmailRow
```

## Related Code Files

- Create: `app/hooks/useKeyboardShortcuts.ts`
- Create: `app/components/ShortcutsHelpModal.tsx`
- Create: `app/components/SwipeableEmailRow.tsx`
- Modify: `app/routes/mailbox.tsx` — call `useKeyboardShortcuts()`
- Modify: `app/routes/email-list.tsx` — wrap rows with `SwipeableEmailRow`
- Modify: `app/hooks/useUIStore.ts` — add `isShortcutsModalOpen` state

## Implementation Steps

### 1. UIStore additions (`app/hooks/useUIStore.ts`)

```ts
isShortcutsModalOpen: boolean;
openShortcutsModal: () => void;
closeShortcutsModal: () => void;
```

### 2. `useKeyboardShortcuts.ts`

The hook reads active folder + page from URL params internally so it mirrors the same query as the visible email list — no prop drilling required.

```ts
export function useKeyboardShortcuts(mailboxId: string | undefined) {
  const {
    selectedEmailId, selectEmail, startCompose,
    openShortcutsModal, closeShortcutsModal, isShortcutsModalOpen,
  } = useUIStore();

  // Mirror the same query parameters as email-list.tsx
  const { folder } = useParams<{ folder: string }>();
  const [searchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");
  const labelId = searchParams.get("label") ?? undefined;

  const { data: listData } = useEmails(mailboxId, {
    folder: folder ?? "inbox",
    page,
    ...(labelId ? { label_id: labelId } : {}),
  });
  const emails = Array.isArray(listData) ? listData : (listData as any)?.emails ?? [];

  const moveEmail = useMoveEmail(mailboxId);
  const updateEmail = useUpdateEmail(mailboxId);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Disable inside inputs / TipTap editor
      const target = e.target as HTMLElement;
      if (
        target.closest("input, textarea, select, [contenteditable]") ||
        target.closest(".ProseMirror")
      ) return;

      switch (e.key) {
        case "j": selectNextEmail(emails, selectedEmailId, selectEmail); break;
        case "k": selectPrevEmail(emails, selectedEmailId, selectEmail); break;
        case "e": if (selectedEmailId) moveEmail.mutate({ id: selectedEmailId, folderId: "archive" }); break;
        case "#": if (selectedEmailId) moveEmail.mutate({ id: selectedEmailId, folderId: "trash" }); break;
        case "r": if (selectedEmailId) startCompose({ mode: "reply" }); break;
        case "f": if (selectedEmailId) startCompose({ mode: "forward" }); break;
        case "s": if (selectedEmailId) toggleStar(selectedEmailId, updateEmail); break;
        case "u": if (selectedEmailId) updateEmail.mutate({ id: selectedEmailId, read: false }); break;
        case "c": e.preventDefault(); startCompose({ mode: "new" }); break;
        case "/": e.preventDefault(); document.querySelector<HTMLInputElement>("[data-search-input]")?.focus(); break;
        case "?": isShortcutsModalOpen ? closeShortcutsModal() : openShortcutsModal(); break;
        case "Escape": closeShortcutsModal(); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedEmailId, emails, isShortcutsModalOpen, /* stable refs */]);
}

function selectNextEmail(emails: Email[], currentId: string | null, select: (id: string) => void) {
  if (!emails.length) return;
  const idx = emails.findIndex((e) => e.id === currentId);
  const next = emails[idx + 1] ?? emails[0];
  select(next.id);
}

function selectPrevEmail(emails: Email[], currentId: string | null, select: (id: string) => void) {
  if (!emails.length) return;
  const idx = emails.findIndex((e) => e.id === currentId);
  const prev = emails[idx - 1] ?? emails[emails.length - 1];
  select(prev.id);
}
```

### 3. `ShortcutsHelpModal.tsx`

Simple modal (Kumo `Dialog` or plain overlay) with a two-column table:

| Key | Action |
|-----|--------|
| `j` / `k` | Next / Previous email |
| `e` | Archive |
| `#` | Delete |
| `r` | Reply |
| `f` | Forward |
| `s` | Toggle star |
| `u` | Mark unread |
| `c` | Compose |
| `/` | Search |
| `?` | This help |
| `Esc` | Close panel |

Rendered via `isShortcutsModalOpen` from UIStore.

### 4. `SwipeableEmailRow.tsx`

```tsx
interface SwipeableEmailRowProps {
  children: React.ReactNode;
  onSwipeRight: () => void;  // archive
  onSwipeLeft: () => void;   // delete
}

export function SwipeableEmailRow({ children, onSwipeRight, onSwipeLeft }: SwipeableEmailRowProps) {
  const startX = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (startX.current === null) return;
    const delta = e.changedTouches[0].clientX - startX.current;
    startX.current = null;
    if (delta > 60) onSwipeRight();        // swipe right → archive
    else if (delta < -60) onSwipeLeft();   // swipe left → delete
  };

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {children}
    </div>
  );
}
```

Threshold of 60px avoids accidental triggers on scroll.

### 5. Mount in `mailbox.tsx`

```tsx
// Inside MailboxRoute component body:
useKeyboardShortcuts(mailboxId);

// In JSX, below the main layout:
<ShortcutsHelpModal />
```

### 6. Wrap email rows in `email-list.tsx`

```tsx
<SwipeableEmailRow
  key={email.id}
  onSwipeRight={() => moveEmail.mutate({ id: email.id, folderId: "archive" })}
  onSwipeLeft={() => {
    if (confirm("Delete this email?")) moveEmail.mutate({ id: email.id, folderId: "trash" });
  }}
>
  {/* existing email row content */}
</SwipeableEmailRow>
```

## Success Criteria

- [ ] `j`/`k` navigate through email list, selection updates email panel
- [ ] `e` archives selected email; email disappears from inbox
- [ ] `#` moves selected email to trash
- [ ] `r`/`f` open compose in reply/forward mode
- [ ] `c` opens new compose
- [ ] `/` focuses the search input
- [ ] `?` opens shortcuts help modal
- [ ] Shortcuts do NOT fire when typing in To/subject/body inputs or TipTap editor
- [ ] Swipe right on mobile archives an email
- [ ] Swipe left on mobile deletes with confirmation

## Risk Assessment

- **`useEmails` navigation source** (resolved): hook reads `folder` from `useParams` and `page`/`label` from `useSearchParams` — same params the email list route already uses. Ensure `useKeyboardShortcuts` is mounted inside the Router context (inside `MailboxRoute`, which it is).
- **TipTap check**: TipTap renders a `div[contenteditable]` with class `.ProseMirror`; the `target.closest("[contenteditable]")` check catches it, but verify in practice
- **Swipe vs scroll conflict**: `onTouchEnd` on a scrolling list can mis-fire; the 60px threshold helps but test on a real device; fall back to only attaching swipe on desktop if problematic
- **`confirm()` for delete on mobile**: native `confirm()` is fine for MVP; replace with a Kumo Dialog if UX feedback says so
