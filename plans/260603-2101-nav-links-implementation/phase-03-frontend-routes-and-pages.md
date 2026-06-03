---
phase: 3
title: Frontend routes and pages
status: completed
priority: P2
effort: 1.5h
dependencies:
  - 2
---

# Phase 3: Frontend routes and pages

## Overview

Register 3 new React Router routes and create their page components. Each page reuses `HomeSidebar` for nav consistency. `/all-inboxes` uses the new backend endpoint from Phase 2. `/domains` reuses cached `configData`. `/settings` wraps theme toggle + link to `/profile`.

## Related Code Files

- Modify: `app/routes.ts`
- Modify: `app/services/api.ts` — add `getAllEmails()` method
- Modify: `app/queries/keys.ts` — add query key for all-emails
- Create: `app/routes/all-inboxes.tsx`
- Create: `app/routes/domains.tsx`
- Create: `app/routes/global-settings.tsx` (filename avoids conflict with mailbox-scoped `settings.tsx`)
- Read: `app/components/home/home-mailbox-card.tsx` — understand card layout pattern before creating new pages

## Architecture

All 3 pages share the same shell:
```tsx
<div className="flex min-h-screen bg-kumo-recessed">
  <HomeSidebar {...props} />
  <main className="flex-1 min-w-0">
    <HomeTopBar ... />
    {/* page content */}
  </main>
</div>
```

`HomeSidebar` needs `accounts`, `activeDomain`, `onDomainChange`, `totalUnread`, `user`, `isAdmin`. For non-home pages, pass `activeDomain={null}` and a no-op `onDomainChange`.

## Implementation Steps

### Step 1 — Register routes in `app/routes.ts`

```typescript
route("all-inboxes", "routes/all-inboxes.tsx"),
route("domains", "routes/domains.tsx"),
route("settings", "routes/global-settings.tsx"),
```

Add above the `route("*", ...)` catch-all.

### Step 2 — Add API method in `app/services/api.ts`

```typescript
getAllEmails: (
  folder = "inbox",
  limit = 25,
  offset = 0,
) =>
  get<{ emails: (Email & { mailboxId: string })[]; total: number }>(
    "/api/v1/emails/all",
    { params: { folder, limit: String(limit), offset: String(offset) } },
  ),
```

### Step 3 — Add query key in `app/queries/keys.ts`

```typescript
allEmails: (folder: string, limit: number, offset: number) =>
  ["emails", "all", folder, limit, offset] as const,
```

### Step 4 — Create `app/routes/all-inboxes.tsx`

- `useMailboxes()` — for sidebar props (accounts, totalUnread)
- `useQuery({ queryKey: queryKeys.allEmails(...), queryFn: () => api.getAllEmails(...) })`
- `authClient.useSession()` — for user/isAdmin
- Layout: same flex shell as home.tsx
- Email list: simple table rows showing mailbox badge, sender, subject snippet, date
  - Mailbox badge: colored dot or small tag showing `mailboxId`
  - Each row links to `/mailbox/:mailboxId/emails/inbox` (navigate on click — no inline reader needed for MVP)
- Pagination: prev/next buttons using `offset` state
- Loading: 3 skeleton rows

```tsx
export default function AllInboxesRoute() {
  const { data: session } = authClient.useSession();
  const { data: mailboxes = [] } = useMailboxes();
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.allEmails("inbox", limit, offset),
    queryFn: () => api.getAllEmails("inbox", limit, offset),
  });

  const totalUnread = mailboxes.reduce(
    (s, m) => s + (m.summary?.inboxUnreadCount ?? 0), 0
  );

  return (
    <div className="flex min-h-screen bg-kumo-recessed">
      <HomeSidebar
        accounts={mailboxes}
        activeDomain={null}
        onDomainChange={() => {}}
        totalUnread={totalUnread}
        user={session?.user}
        isAdmin={session?.user?.role === "admin"}
      />
      <main className="flex-1 min-w-0">
        <HomeTopBar ... />
        {/* email list */}
      </main>
    </div>
  );
}
```

### Step 5 — Create `app/routes/domains.tsx`

- `useQuery({ queryKey: queryKeys.config, queryFn: () => api.getConfig() })` — already cached
- `useMailboxes()` — for counts + sidebar
- Group mailboxes by domain (same logic as home.tsx `groupedByDomain`)
- Layout: cards or table rows per domain
  - Domain name, mailbox count badge, status indicators

```tsx
// Domain card: show globe icon, domain name, X mailboxes
// Clicking a domain row could navigate to / with domain filter — out of scope for now
```

### Step 6 — Create `app/routes/global-settings.tsx`

- Two sections only:
  1. **Appearance** — theme toggle using `ThemeToggleButton` component from `app/components/theme-toggle-button.tsx`
  2. **Account** — name, email display + "Edit profile" button → `navigate("/profile")`
- `authClient.useSession()` — for user display
- No forms, no API calls — purely reads + navigate

```tsx
export default function GlobalSettingsRoute() {
  const { data: session } = authClient.useSession();
  const navigate = useNavigate();
  // ...sidebar props from useMailboxes + session
  return (
    <div className="flex min-h-screen bg-kumo-recessed">
      <HomeSidebar ... />
      <main className="flex-1 min-w-0">
        {/* Appearance section */}
        {/* Account section with "Edit Profile" button */}
      </main>
    </div>
  );
}
```

### Step 7 — Update `HomeTopBar` breadcrumb (optional)

`HomeTopBar` currently hardcodes `Mailboxes` in the breadcrumb. Either:
- Accept a `pageTitle` prop and pass appropriate string from each route, or
- Leave as-is for now (not user-visible in nav, low priority)

Recommendation: accept `pageTitle?: string` prop, default `"Mailboxes"`.

## Success Criteria

- [ ] `/all-inboxes` renders emails from all mailboxes, sorted by date
- [ ] `/all-inboxes` shows mailbox badge per row; each row links to the mailbox inbox
- [ ] `/domains` lists all connected domains with mailbox count per domain
- [ ] `/settings` shows theme toggle (working) and "Edit Profile" button navigating to `/profile`
- [ ] All 3 pages render `HomeSidebar` with correct active nav item
- [ ] TypeScript compiles — no errors in new route files
- [ ] `HomeTopBar` breadcrumb reflects the current page (or at minimum doesn't crash)

## Risk Assessment

- **`HomeTopBar` breadcrumb**: hardcoded "Mailboxes" will be wrong on other pages. Fix with a `pageTitle` prop — simple.
- **`HomeSidebar` prop drilling**: all 3 new pages need `accounts`/`totalUnread` which require `useMailboxes()`. This is a repeated pattern — acceptable (3 call-sites, not worth abstracting yet per YAGNI).
- **`global-settings.tsx` filename**: avoids collision with `routes/settings.tsx` (which is per-mailbox). Route path is `/settings` regardless of filename.
