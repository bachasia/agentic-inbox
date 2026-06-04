---
phase: 2
title: "Backend CRUD API"
status: pending
effort: "1h"
dependencies: [1]
---

# Phase 2: Backend CRUD API

## Overview

Cập nhật `/api/v1/config` để merge env var domains + D1 domains. Thêm 2 admin routes để add/delete domain trong D1. Chỉ `admin` role mới được phép.

## Architecture

### Data flow

```
GET /api/v1/config
  ├── env.DOMAINS (comma-separated) → source: "env"
  └── D1 custom_domains table      → source: "custom"
      ↓ merge + dedup by domain name
  → { domains: [{ domain, source }[], emailAddresses }
```

### New admin routes

```
POST   /api/v1/admin/domains          body: { domain: string }
DELETE /api/v1/admin/domains/:domain
```

Both routes: `requireAuth` + `requireAdmin` middleware.

## Related Code Files

- Modify: `workers/index.ts` — update `/api/v1/config` handler (lines 99–103)
- Modify: `workers/routes/admin-routes.ts` — add 2 new routes
- Modify: `app/services/api.ts` — add `addDomain`, `deleteDomain` functions
- Modify: `app/types/index.ts` — add `DomainInfo` type

## Implementation Steps

### 1. Update `app/types/index.ts`

Add type:
```ts
export interface DomainInfo {
  domain: string;
  source: "env" | "custom";
}
```

### 2. Update `/api/v1/config` in `workers/index.ts`

Replace lines 99–103:
```ts
app.get("/api/v1/config", requireAuth, async (c) => {
  const envDomains: DomainInfo[] = (c.env.DOMAINS || "")
    .split(",").map((d) => d.trim()).filter(Boolean)
    .map((domain) => ({ domain, source: "env" as const }));

  const d1Rows = await c.env.AUTH_DB
    .prepare("SELECT domain FROM custom_domains ORDER BY created_at ASC")
    .all<{ domain: string }>();

  const envSet = new Set(envDomains.map((d) => d.domain));
  const customDomains: DomainInfo[] = d1Rows.results
    .filter((r) => !envSet.has(r.domain))  // dedup: env takes precedence
    .map((r) => ({ domain: r.domain, source: "custom" as const }));

  const domains = [...envDomains, ...customDomains];
  const emailAddresses = c.env.EMAIL_ADDRESSES || [];
  return c.json({ domains, emailAddresses });
});
```

> Note: add `requireAuth` to config endpoint since it now reads D1 (authenticated context). Frontend already has auth session.

### 3. Add domain CRUD to `workers/routes/admin-routes.ts`

Before `export { app as adminRoutes }`:

```ts
// Domain validation helper
function isValidDomain(domain: string): boolean {
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z]{2,})+$/.test(domain);
}

// Add custom domain
app.post("/domains", requireAdmin, async (c) => {
  const { domain: raw } = await c.req.json<{ domain: string }>();
  const domain = (raw ?? "").toLowerCase().trim()
    .replace(/^https?:\/\//, "").replace(/\/+$/, "");

  if (!domain || !isValidDomain(domain)) {
    return c.json({ error: "Invalid domain format" }, 400);
  }

  const user = c.get("user");
  try {
    await c.env.AUTH_DB.prepare(
      "INSERT INTO custom_domains (id, domain, created_at, created_by) VALUES (?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), domain, new Date().toISOString(), user.id).run();
    return c.json({ domain, source: "custom" }, 201);
  } catch (e: any) {
    if (e?.message?.includes("UNIQUE")) {
      return c.json({ error: "Domain already exists" }, 409);
    }
    throw e;
  }
});

// Delete custom domain (only D1-managed — not env var domains)
app.delete("/domains/:domain", requireAdmin, async (c) => {
  const domain = decodeURIComponent(c.req.param("domain")).toLowerCase();
  const envDomains = (c.env.DOMAINS || "").split(",").map((d) => d.trim());
  if (envDomains.includes(domain)) {
    return c.json({ error: "Cannot delete env-configured domain" }, 403);
  }
  const result = await c.env.AUTH_DB.prepare(
    "DELETE FROM custom_domains WHERE domain = ?"
  ).bind(domain).run();
  if (result.meta.changes === 0) {
    return c.json({ error: "Domain not found" }, 404);
  }
  return c.json({ ok: true });
});
```

Verify admin routes are mounted with prefix `/api/v1/admin` in `workers/index.ts`.

### 4. Update `app/services/api.ts`

```ts
addDomain: (domain: string) =>
  post<{ domain: string; source: string }>("/api/v1/admin/domains", { domain }),

deleteDomain: (domain: string) =>
  del<{ ok: boolean }>(`/api/v1/admin/domains/${encodeURIComponent(domain)}`),
```

Check if `del` helper exists; if not use `request("DELETE", ...)` pattern already in api.ts.

## Success Criteria

- [ ] `GET /api/v1/config` returns `domains` as `{ domain, source }[]`
- [ ] `POST /api/v1/admin/domains` adds domain to D1, returns 409 on duplicate
- [ ] `DELETE /api/v1/admin/domains/:domain` removes D1 domain, returns 403 for env domains
- [ ] Non-admin gets 403 on POST/DELETE
- [ ] Domain validation rejects invalid formats (with protocol, trailing slash, etc.)

## Risk Assessment

- **Config endpoint now requires auth** — frontend `api.getConfig()` is called only after login, so no regression. Verify domains page isn't rendered for unauthenticated users.
- Env var domains cannot be deleted from UI — enforced server-side (403).
