# Phase 06: PWA Support

## Context Links
- [Plan overview](./plan.md)
- [Web App Manifest spec](https://developer.mozilla.org/en-US/docs/Web/Manifest)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- Current `<head>`: `app/root.tsx:82-93`
- Current public assets: `public/favicon.ico`, `public/favicon.svg`

## Overview
- **Priority:** P3 (nice-to-have)
- **Status:** pending
- **Effort:** 2h
- **Description:** Add web app manifest for home screen installation and a minimal service worker for offline caching of app shell and previously-viewed emails. Keep it simple -- no Workbox, no complex caching strategies.
- **Dependencies:** None (but benefits from Phase 04 dark mode for manifest `theme_color`)

## Key Insights

### What PWA Gives Us
- **Home screen install**: "Add to Home Screen" on mobile/desktop -- app launches in standalone window
- **Offline app shell**: HTML/CSS/JS cached so the UI loads even without network
- **Cached email reading**: Previously-viewed emails readable offline (API responses cached)
- **Push notifications**: NOT implementing (requires push subscription server -- YAGNI)

### Cloudflare Access Constraint
- All requests must pass CF Access JWT validation (`workers/app.ts:46-81`)
- Service worker **cannot** cache authenticated API responses for offline use without the JWT
- Strategy: cache only the **app shell** (HTML, CSS, JS, icons) and **previously-fetched email list/detail responses**
- On offline API requests, serve from cache if available, otherwise show "offline" state
- SW must **not** intercept `/agents/*` (WebSocket), `/mcp/*`, or initial Access auth redirects

### Service Worker Scope
- Cache: app shell (/, *.js, *.css, icons), GET `/api/v1/mailboxes/*/emails*` responses
- Bypass: POST/PUT/DELETE requests, `/agents/*`, `/mcp/*`, `cdn-cgi/*`
- Strategy: **stale-while-revalidate** for app shell, **network-first** for API calls (cache as fallback)

## Requirements

### Functional
- `public/manifest.json` with app name, icons, theme colors, display mode
- Service worker registered from `app/root.tsx`
- App shell cached on install for offline loading
- Previously-viewed email lists and email details available offline
- Installable on iOS Safari, Android Chrome, desktop Chrome/Edge

### Non-Functional
- Service worker <100 lines (KISS -- no Workbox)
- Cache size capped (max 200 API response entries, evict oldest)
- No interference with Cloudflare Access auth flow
- No interference with WebSocket connections (agent panel)

## Architecture

### Manifest
```json
{
  "name": "Agentic Inbox",
  "short_name": "Inbox",
  "description": "AI-powered email client on Cloudflare",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2563eb",
  "icons": [
    { "src": "/favicon.svg", "type": "image/svg+xml", "sizes": "any" },
    { "src": "/icon-192.png", "type": "image/png", "sizes": "192x192" },
    { "src": "/icon-512.png", "type": "image/png", "sizes": "512x512" }
  ]
}
```

### Service Worker Caching Strategy
```
Request arrives at SW:
  ├── Is it POST/PUT/DELETE/PATCH?  → pass through to network (never cache mutations)
  ├── Is it /agents/*, /mcp/*, cdn-cgi/*?  → pass through (WebSocket/auth)
  ├── Is it a static asset (JS/CSS/SVG/ICO)?  → cache-first, update in background
  ├── Is it GET /api/v1/*?  → network-first, cache response for offline fallback
  └── Is it navigation (HTML)?  → network-first, cache app shell as fallback
```

### Data Flow
```
First visit (online):
  Browser → CF Access auth → Worker serves app shell
  SW installs → caches app shell (/, main.js, main.css, icons)
  User navigates mailbox → API responses cached in SW cache

Subsequent visit (online):
  SW serves cached shell instantly → revalidates from network in background
  API calls go to network first → update cache

Offline visit:
  SW serves cached app shell → UI renders
  API calls fail network → SW serves cached responses
  Uncached routes → UI shows "offline" message
```

## Related Code Files

### Files to Create
| File | Purpose | Est. Lines |
|------|---------|-----------|
| `public/manifest.json` | Web app manifest | ~25 |
| `public/service-worker.js` | Service worker (plain JS, not bundled) | ~80 |
| `public/icon-192.png` | PWA icon 192x192 | binary |
| `public/icon-512.png` | PWA icon 512x512 | binary |

### Files to Modify
| File | Change |
|------|--------|
| `app/root.tsx:82-93` | Add `<link rel="manifest">`, `<meta name="theme-color">`, SW registration script |

### Icon Generation
Generate PNG icons from the existing `public/favicon.svg` using a build script or manual conversion. The SVG is already vector -- just needs rasterization at 192x192 and 512x512.

## Implementation Steps

### Step 1: Create `public/manifest.json`

Standard web app manifest with:
- `name`: "Agentic Inbox"
- `short_name`: "Inbox"
- `start_url`: "/"
- `display`: "standalone"
- `theme_color`: "#2563eb" (kumo primary blue)
- `background_color`: "#ffffff"
- Icons: SVG (any size) + PNG at 192 and 512

### Step 2: Generate PNG icons

Convert `public/favicon.svg` to PNG at required sizes:
```bash
# Using ImageMagick or similar
convert -background none public/favicon.svg -resize 192x192 public/icon-192.png
convert -background none public/favicon.svg -resize 512x512 public/icon-512.png
```

If ImageMagick unavailable, use an online SVG-to-PNG converter or create simple colored icons programmatically.

### Step 3: Create `public/service-worker.js`

Plain JS service worker (not TypeScript -- SW runs outside the bundle):

```js
const CACHE_NAME = "agentic-inbox-v1";
const APP_SHELL = ["/", "/favicon.svg", "/favicon.ico"];
const API_CACHE = "agentic-inbox-api-v1";
const MAX_API_ENTRIES = 200;

// Install: pre-cache app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== API_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: route-based caching strategy
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Never cache: mutations, WebSocket, MCP, auth
  if (request.method !== "GET") return;
  if (url.pathname.startsWith("/agents/")) return;
  if (url.pathname.startsWith("/mcp")) return;
  if (url.pathname.includes("cdn-cgi")) return;
  
  // API routes: network-first with cache fallback
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirstWithCache(request));
    return;
  }
  
  // Static assets and navigation: stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request));
});
```

### Step 4: Modify `app/root.tsx`

In the `Layout` component `<head>`:
```tsx
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#2563eb" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
```

Add SW registration script at end of `<body>` (after `<Scripts />`):
```tsx
<script dangerouslySetInnerHTML={{ __html: `
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  }
` }} />
```

### Step 5: Verify
- Check Chrome DevTools > Application > Manifest -- should show app info and icons
- Check Chrome DevTools > Application > Service Workers -- should show registered SW
- Click "Install" prompt in Chrome address bar (desktop) or "Add to Home Screen" (mobile)
- Go offline (DevTools > Network > Offline) -- cached pages should load
- Verify agent panel WebSocket still works when online (not intercepted by SW)

## Todo List

- [ ] Create `public/manifest.json`
- [ ] Generate `public/icon-192.png` and `public/icon-512.png` from favicon.svg
- [ ] Create `public/service-worker.js`
- [ ] Add manifest link, theme-color meta, apple-mobile meta tags to `app/root.tsx`
- [ ] Add SW registration script to `app/root.tsx`
- [ ] Manual test: installability on Chrome desktop
- [ ] Manual test: offline app shell loading
- [ ] Manual test: cached email reading offline
- [ ] Manual test: agent panel WebSocket not broken
- [ ] Run typecheck

## Success Criteria

1. Chrome shows "Install" option for the app
2. Installed app launches in standalone window (no browser chrome)
3. App shell loads when offline
4. Previously-viewed emails readable offline
5. Agent panel WebSocket unaffected
6. No interference with Cloudflare Access auth flow
7. `npm run typecheck` passes

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SW caches stale app shell after deploy | Medium | Medium | Version cache name (`v1`, `v2`); `skipWaiting` + `clients.claim` for immediate takeover |
| SW intercepts CF Access auth redirect | Low | High | Bypass all `cdn-cgi/*` paths and non-GET requests |
| SW interferes with WebSocket upgrade | Low | High | Bypass all `/agents/*` paths; SW only handles fetch events, not WebSocket |
| iOS Safari PWA limitations (no push, limited storage) | Certain | Low | Accept limitations; offline reading is the primary value |
| Cache grows unbounded | Medium | Low | Cap API cache at 200 entries; evict oldest on overflow |

## Security Considerations
- Service worker runs in the same origin -- no cross-origin concerns
- Cached API responses include auth-gated data -- acceptable since SW is same-origin and user is already authenticated
- SW cache is cleared on uninstall
- No push notification subscription -- no server-side push endpoint needed
- `dangerouslySetInnerHTML` for SW registration is safe -- contains no user input, hardcoded script
