# Web Performance Audit — DTC Inbox (dtc-inbox.ngohoan.com)
**Date:** 2026-06-04 | **Auditor:** Claude (browser-harness)

---

## Core Web Vitals Summary

| Metric | Value | Rating |
|--------|-------|--------|
| TTFB | 774ms | ⚠️ Needs attention (threshold: <800ms good) |
| FCP | 972ms | ✅ Good (threshold: <1800ms) |
| DOM Content Loaded | 943ms | ✅ Good |
| Load Complete | 1006ms | ✅ Good (~1s total) |
| LCP | ~1000ms (estimated) | ✅ Good |
| Email interaction (click → render) | ~100ms | ✅ Excellent |

**Overall verdict:** App loads fast. No critical Core Web Vital failures. Issues are in caching strategy and bundle size that will hurt repeat visitors.

---

## Infrastructure (Green ✅)

| Item | Status |
|------|--------|
| CDN | Cloudflare (cf-ray detected) |
| HTTP protocol | HTTP/3 (`h3=":443"`) |
| Compression | **zstd** (Zstandard — better than gzip/brotli) |
| CF CDN cache | HIT on static assets |

---

## Issues Found

### 🔴 P1 — Cache-Control Headers Wrong on Static Assets

**Current:** `cache-control: public, max-age=0, must-revalidate`
**Expected:** `cache-control: public, max-age=31536000, immutable`

Assets like `entry.client-CxmQcfLL.js`, `tooltip-*.js` etc. have content-hashed filenames — they can never change without a new URL. But `max-age=0` forces the browser to re-validate on **every page visit**, adding a round-trip to the CDN even when it hits.

**Impact:** Every page reload = browser → CDN request for each JS/CSS file, even if nothing changed. On slow connections or CDN-edge-far regions, this adds 50–200ms per cached asset.

**Fix (Cloudflare):** Add a Page Rule or Cache Rule:
```
URL: dtc-inbox.ngohoan.com/assets/*
Cache-Control: public, max-age=31536000, immutable
```
Or in the build/server config, set the `Cache-Control` header for `/assets/**` to `max-age=31536000, immutable`.

---

### 🔴 P1 — Unauthenticated `/` Shows Infinite Spinner

When visiting `https://dtc-inbox.ngohoan.com/` without a session, the page shows only a full-screen spinner indefinitely. It never redirects to `/login`.

**Impact:** First-time or logged-out users see a blank spinning screen forever. The login page exists at `/login` but is not reached automatically.

**Fix:** In the root route loader/auth guard, add an explicit redirect:
```ts
// e.g. in root.tsx or auth middleware
if (!session) {
  throw redirect("/login");
}
```

---

### 🟡 P2 — `labels-B3YjIxAW.js` = 441 KB (Largest Bundle)

The `labels` chunk is the largest single JS file at **441 KB decoded**. This is lazy-loaded only on navigation to the mailbox view, so it doesn't affect initial FCP. But it's extremely large for a "labels" feature — investigate contents.

**Likely causes:**
- TipTap rich text editor bundled entirely in this chunk (TipTap + extensions ≈ 200–300KB)
- Or large icon set / data file included without tree-shaking

**Fix:** Run `vite-bundle-visualizer` or `rollup-plugin-visualizer` to inspect contents. Split TipTap extensions as dynamic imports if not all needed upfront.

---

### 🟡 P2 — `tooltip-*.js` = 207 KB

The tooltip chunk is 207 KB — far too large for tooltip-only functionality. This strongly suggests the entire Radix UI or Floating UI primitive tree is being bundled together.

**Fix:** Check if all Radix UI components are exported from a barrel file and tree-shaking is not working. Ensure named imports (`import { Tooltip } from "@radix-ui/react-tooltip"`) not barrel imports.

---

### 🟡 P2 — Total JS Bundle = 1.7 MB (After Full Navigation)

| Bundle | Size |
|--------|------|
| `labels-B3YjIxAW.js` | 441 KB |
| `tooltip-*.js` | 207 KB |
| `entry.client-*.js` | 183 KB |
| `AgentPanel-*.js` | 172 KB |
| `react-*.js` | 147 KB |
| `chunk-*.js` | 126 KB |
| `MailboxSplitView-*.js` | 71 KB |
| `mailbox-*.js` | 35 KB |
| Others | ~320 KB |
| **Total** | **~1,702 KB** |

With zstd, actual wire transfer is ~30–40% of decoded size, so ~500–680 KB over network. Acceptable for now but could be trimmed by addressing P2 items above.

---

### 🟡 P2 — CSS = 119 KB

`root-CICyoAla.css` is 119 KB decoded. With Tailwind, this suggests either:
- The `content` config is too broad (scanning too many paths)
- Or unused utility classes aren't being purged in production

**Fix:** Check `tailwind.config.ts` content array — should only include actual source files, not `node_modules` or generated directories. Run `npx tailwindcss --input src/input.css --output /dev/null --minify` and compare output size.

---

## UX / Animation Observations

| Interaction | Behavior | Notes |
|------------|----------|-------|
| Sidebar navigation | Instant | No animation lag |
| Email row click → thread open | ~100ms | Excellent |
| Compose modal open | ~200ms | Smooth |
| Rich text editor typing | Responsive | No input lag |
| Page-to-page navigation (SPA) | Fast | Remix/React Router working well |
| Email thread expansion | Smooth | No visible jank |

No animation jank or layout shifts observed during testing. The UI is responsive and smooth overall.

---

## Recommendations (Priority Order)

1. **Fix Cache-Control on `/assets/*`** — 30-minute Cloudflare config change. High impact on repeat visit performance.
2. **Fix root `/` redirect when unauthenticated** — simple auth guard fix. Eliminates confusing blank-screen UX.
3. **Investigate `labels` 441KB chunk** — run bundle visualizer, split TipTap if bundled there.
4. **Audit `tooltip` 207KB chunk** — verify tree-shaking on Radix UI / Floating UI.
5. **Audit CSS purging** — reduce 119KB CSS if unused classes are present.

---

## What Doesn't Need Fixing

- Compression: zstd is already optimal — do not change.
- HTTP/3: already enabled via Cloudflare — no action needed.
- FCP/LCP: already in "good" range — no changes needed here.
- Lazy loading: JS already split into route-level chunks — architecture is correct.
- CDN: Cloudflare serving all assets with HIT — no infrastructure changes needed.
