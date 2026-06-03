# Phase 04: Dark Mode

## Context Links
- [Plan overview](./plan.md)
- [Kumo colors docs](https://kumo-ui.com/colors/)
- [Kumo dark mode via `data-mode`](https://deepwiki.com/cloudflare/kumo)
- Current `<html>` tag: `app/root.tsx:80`
- Header component: `app/components/Header.tsx`
- UI store: `app/hooks/useUIStore.ts`

## Overview
- **Priority:** P2
- **Status:** pending
- **Effort:** 3h
- **Description:** System-preference-aware dark theme with manual toggle. Kumo uses CSS `light-dark()` and `data-mode` attribute on `<html>` -- no Tailwind `dark:` variants needed. All `bg-kumo-*`, `text-kumo-*`, `border-kumo-*` tokens automatically adapt.
- **Dependencies:** None (independent)

## Key Insights

### How Kumo Dark Mode Works
- Kumo semantic tokens (`bg-kumo-base`, `text-kumo-default`, `border-kumo-line`, etc.) use CSS `light-dark()` internally
- Setting `data-mode="dark"` on `<html>` switches all kumo components to dark palette
- Setting `data-mode="light"` forces light mode
- Omitting `data-mode` (or setting `data-mode="system"`) defaults to system preference via `prefers-color-scheme`
- **No `dark:` Tailwind variants needed** -- kumo tokens handle everything

### What Needs Custom Dark Handling
Grep of the codebase for raw colors that bypass kumo tokens:

| File | Pattern | Issue |
|------|---------|-------|
| `app/index.css:7` | `body { margin: 0; }` | No raw colors -- safe |
| `app/index.css:10-26` | `.ProseMirror` styles | No colors -- safe |
| `app/root.tsx:95` | `className="bg-kumo-recessed text-kumo-default"` | Uses kumo tokens -- safe |
| `app/components/Header.tsx:59` | `bg-kumo-base border-kumo-line` | Uses kumo tokens -- safe |

The codebase already uses kumo semantic tokens everywhere. The only work needed:
1. Add `data-mode` attribute to `<html>` based on preference
2. Create theme preference store (localStorage + system preference)
3. Add toggle button in header

### Theme Preference Logic
```
User preference (localStorage)  →  "light" | "dark" | "system"
  ↓
If "system" → read prefers-color-scheme media query
  ↓
Apply data-mode="light" or data-mode="dark" to <html>
```

## Requirements

### Functional
- System preference detection via `prefers-color-scheme` media query
- Manual toggle: light → dark → system (3-way cycle)
- Preference persisted in `localStorage` under key `theme-preference`
- `data-mode` attribute set on `<html>` element
- Toggle icon in header reflects current mode

### Non-Functional
- No flash of wrong theme on page load (inject script in `<head>` before React hydrates)
- Preference survives page reload and browser restart
- Works with all existing kumo components without additional CSS

## Architecture

### Component Design
```
<html data-mode="dark">        ← set by theme init script + React
  <head>
    <script>/* theme init */</script>   ← prevents FOUC
  </head>
  <body class="bg-kumo-recessed text-kumo-default">
    <Header>
      <ThemeToggle />           ← new: cycles light/dark/system
    </Header>
    ...
  </body>
</html>
```

### State Management
New Zustand store `useThemeStore` (separate from useUIStore to keep concerns isolated):

```ts
interface ThemeState {
  preference: "light" | "dark" | "system";
  resolved: "light" | "dark";          // actual applied mode
  setPreference: (pref: "light" | "dark" | "system") => void;
  cycleTheme: () => void;              // light → dark → system → light
}
```

### Data Flow
```
Page load:
  1. <script> in <head> reads localStorage("theme-preference")
  2. If "system", reads prefers-color-scheme
  3. Sets data-mode on <html> immediately (no FOUC)
  4. React hydrates, useThemeStore syncs with DOM

User clicks toggle:
  1. cycleTheme() updates preference in store
  2. Effect writes to localStorage
  3. Effect sets data-mode on document.documentElement
  4. Kumo CSS light-dark() reacts instantly (no re-render needed for colors)

System preference changes (while set to "system"):
  1. matchMedia listener fires
  2. Store updates resolved mode
  3. data-mode updated on <html>
```

## Related Code Files

### Files to Create
| File | Purpose | Est. Lines |
|------|---------|-----------|
| `app/hooks/use-theme-store.ts` | Zustand theme preference store with localStorage sync | ~60 |
| `app/components/theme-toggle-button.tsx` | Header button cycling light/dark/system | ~50 |

### Files to Modify
| File | Change |
|------|--------|
| `app/root.tsx:79-101` | Add `data-mode` attribute to `<html>`, add FOUC-prevention script in `<head>` |
| `app/components/Header.tsx:121-147` | Add ThemeToggleButton to header actions |

### Files NOT Modified
- `app/index.css` -- no custom dark styles needed (kumo handles it)
- `app/hooks/useUIStore.ts` -- theme state is separate concern
- Any component using `bg-kumo-*` tokens -- they auto-adapt

## Implementation Steps

### Step 1: Create `app/hooks/use-theme-store.ts`

Zustand store with:
- `preference`: persisted to `localStorage("theme-preference")`
- `resolved`: computed from preference + system media query
- `cycleTheme()`: light → dark → system → light
- `useEffect` in a hook that:
  - Syncs `data-mode` on `document.documentElement`
  - Listens to `prefers-color-scheme` changes when preference is "system"
  - Writes to localStorage on preference change

### Step 2: Create `app/components/theme-toggle-button.tsx`

- Import `SunIcon`, `MoonIcon`, `DesktopIcon` (or `MonitorIcon`) from `@phosphor-icons/react`
- Show current mode icon
- `onClick` calls `cycleTheme()`
- Tooltip shows current mode name ("Light", "Dark", "System")
- Uses kumo `Button` + `Tooltip` components

### Step 3: Modify `app/root.tsx` -- FOUC prevention

Add inline script in `<head>` (before `<Links />`) that:
```js
(function() {
  var p = localStorage.getItem("theme-preference") || "system";
  var mode = p;
  if (p === "system") {
    mode = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-mode", mode);
})();
```

This runs before React hydrates, preventing a flash of wrong theme.

### Step 4: Modify `app/root.tsx` -- Layout component

Add `data-mode` attribute to `<html>` tag. Since the inline script sets it immediately, React just needs to not override it on hydration. Use `suppressHydrationWarning` on `<html>` since the script may set a different `data-mode` than SSR default.

### Step 5: Modify `app/components/Header.tsx`

Add `ThemeToggleButton` to the right-side action buttons, between the agent panel toggle and settings button.

### Step 6: Add `useThemeSync` hook call

In `app/root.tsx` App component, call a `useThemeSync()` hook that:
- Initializes store from localStorage on mount
- Sets up `matchMedia` listener for system preference changes
- Syncs `data-mode` attribute on preference changes

### Step 7: Verify
- Toggle through light → dark → system in the UI
- Refresh page -- preference persists, no FOUC
- Change OS dark mode setting while on "system" -- app follows
- All kumo components render correctly in both modes
- Run typecheck

## Todo List

- [ ] Create `app/hooks/use-theme-store.ts`
- [ ] Create `app/components/theme-toggle-button.tsx`
- [ ] Add FOUC-prevention script to `app/root.tsx` `<head>`
- [ ] Add `data-mode` and `suppressHydrationWarning` to `<html>` in `app/root.tsx`
- [ ] Add `useThemeSync()` call in App component
- [ ] Add ThemeToggleButton to `app/components/Header.tsx`
- [ ] Manual test: light/dark/system toggle
- [ ] Manual test: page refresh preserves preference
- [ ] Manual test: OS preference change triggers update in system mode
- [ ] Run typecheck

## Success Criteria

1. Toggle button in header cycles through light → dark → system
2. Theme persists across page refreshes via localStorage
3. System mode tracks OS preference changes in real-time
4. No flash of incorrect theme on page load
5. All kumo components render correctly in dark mode
6. TipTap editor (ProseMirror) is readable in dark mode
7. `npm run typecheck` passes

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| TipTap/ProseMirror styles not adapting to dark mode | ProseMirror in `app/index.css` has no color styles -- it inherits from parent. If needed, add `.ProseMirror` dark overrides in CSS |
| `EmailIframe` (sandboxed iframe for HTML email bodies) ignores dark mode | Email bodies are sender-authored HTML -- they should NOT be themed. The iframe sandbox is correct behavior |
| `suppressHydrationWarning` masking real hydration issues | Only applied to `<html>` element for `data-mode` attribute; other hydration mismatches still reported |
| FOUC on very slow connections | Inline script in `<head>` runs synchronously before any rendering -- no network dependency |

## Security Considerations
- localStorage is same-origin only -- no cross-site theme leakage
- Inline script in `<head>` is minimal and contains no user input -- no XSS vector
- `data-mode` attribute is set to a hardcoded enum value, never user-supplied strings
