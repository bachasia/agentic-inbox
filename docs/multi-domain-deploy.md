# Multi-Domain Deployment Guide

Two patterns for multi-domain support. Choose based on your needs.

## Pattern A: Multi-Worker (Isolated)

Deploy one codebase to multiple Cloudflare Workers — one Worker per domain.
Updates push to all domains automatically via GitHub Actions on every merge to `main`.

## Architecture

```
bachasia/agentic-inbox (single repo)
  ├── wrangler.jsonc          ← one env block per domain
  ├── scripts/setup-domain.sh ← one-time setup per domain
  └── .github/workflows/ci.yml (DEPLOY_ENVS: bach-asia example-com ...)
        │
        ├── push to main → build → deploy env: bach-asia    → agentic-inbox-bach-asia
        │                        → deploy env: example-com  → agentic-inbox-example-com
        └──                      → deploy env: another-org  → agentic-inbox-another-org
```

Each environment has isolated storage: its own R2 bucket, Vectorize index, and Durable Objects.

---

## Adding a New Domain (one-time setup)

### Step 1 — Run setup script

```bash
./scripts/setup-domain.sh <slug> <domain>

# Example:
./scripts/setup-domain.sh example-com example.com
```

The script will:
- Create the R2 bucket (`agentic-inbox-<slug>`)
- Create the Vectorize index + metadata index (`email-embeddings-<slug>`)
- Print the `wrangler.jsonc` env block to paste in
- Wait for confirmation, then run the first deploy

### Step 2 — Add env block to `wrangler.jsonc`

The script prints the exact block to paste inside `"env": { ... }`. Example:

```jsonc
"example-com": {
  "name": "agentic-inbox-example-com",
  "vars": { "DOMAINS": "example.com", "EMAIL_ADDRESSES": [] },
  "send_email": [{ "name": "EMAIL", "remote": true }],
  "r2_buckets": [
    { "binding": "BUCKET", "bucket_name": "agentic-inbox-example-com", "preview_bucket_name": "agentic-inbox-example-com" }
  ],
  "ai": { "binding": "AI" },
  "vectorize": [{ "binding": "VECTORIZE", "index_name": "email-embeddings-example-com" }],
  "durable_objects": {
    "bindings": [
      { "name": "MAILBOX",     "class_name": "MailboxDO" },
      { "name": "EMAIL_AGENT", "class_name": "EmailAgent" },
      { "name": "EMAIL_MCP",   "class_name": "EmailMCP" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["MailboxDO"] },
    { "tag": "v2", "new_sqlite_classes": ["EmailAgent"] },
    { "tag": "v3", "new_sqlite_classes": ["EmailMCP"] }
  ]
}
```

### Step 3 — Register slug in GitHub Actions

Open `.github/workflows/ci.yml` and append the slug to `DEPLOY_ENVS`:

```yaml
env:
  DEPLOY_ENVS: bach-asia example-com   # ← add slug here
```

Push to `main` — the new domain is now included in all future auto-deploys.

### Step 4 — Configure Cloudflare Access

In Cloudflare dashboard → Workers → `agentic-inbox-<slug>` → Settings → Domains & Routes:

1. Enable one-click Cloudflare Access
2. Copy `POLICY_AUD` and `TEAM_DOMAIN` from the modal
3. Set them as Worker secrets:

```bash
wrangler secret put POLICY_AUD --env <slug>
wrangler secret put TEAM_DOMAIN --env <slug>
```

### Step 5 — Set up Email Routing

Cloudflare dashboard → your domain → Email Routing:
- Create a catch-all rule forwarding to Worker `agentic-inbox-<slug>`

### Step 6 — Create mailboxes

Visit the deployed Worker URL and create mailboxes for addresses on your domain.

---

## GitHub Actions Setup (one-time, per repo)

Add `CLOUDFLARE_API_TOKEN` as a repository secret:

1. Cloudflare dashboard → My Profile → API Tokens → Create Token
2. Use template **"Edit Cloudflare Workers"** (includes Workers, R2, D1 permissions)
3. GitHub repo → Settings → Secrets → Actions → New secret: `CLOUDFLARE_API_TOKEN`

---

## How Updates Work

```
git push origin main
  └── CI: typecheck + tests pass
        └── Deploy loop:
              for env in $DEPLOY_ENVS:
                wrangler deploy --env $env
```

All domains get the update in one pipeline run. No manual action needed.

---

## Registered Domains

| Slug | Domain | Worker | R2 Bucket | Vectorize Index |
|---|---|---|---|---|
| `bach-asia` | `bach.asia` | `agentic-inbox-bach-asia` | `agentic-inbox-bach-asia` | `email-embeddings-bach-asia` |

---

## Manual Deploy (without GitHub Actions)

```bash
# Single domain
wrangler deploy --env bach-asia

# All domains at once
for env in bach-asia example-com; do
  wrangler deploy --env "$env"
done
```

---

## Pattern B: Single Worker, Multiple Domains

One Worker handles all domains. Simpler setup, shared resources, single UI.

### How It Works

```
Domain A (Email Routing catch-all) ──┐
Domain B (Email Routing catch-all) ──┼──▶ Worker "agentic-inbox-bach-asia"
Domain C (Email Routing catch-all) ──┘        │
                                              ├── R2 bucket (shared)
                                              ├── Vectorize index (shared)
                                              └── Durable Objects (per-mailbox, isolated)
```

Each mailbox is isolated via Durable Objects (keyed by full email address), so `hello@domainA.com` and `hello@domainB.com` are completely separate.

### Adding a Domain to Existing Worker

**Step 1** — Update `DOMAINS` in `wrangler.jsonc`:

```jsonc
"vars": {
  "DOMAINS": "bach.asia,newdomain.com",  // comma-separated
  "EMAIL_ADDRESSES": []
}
```

**Step 2** — Add domain to Cloudflare account (if not already there).

**Step 3** — Configure Email Routing for new domain:
- Cloudflare dashboard → new domain → Email Routing → Enable
- Create catch-all rule → forward to **existing** Worker (`agentic-inbox-bach-asia`)

**Step 4** — Configure DNS for outbound email:
- Add SPF record: `v=spf1 include:_spf.mx.cloudflare.net ~all`
- Add DKIM record (from Email Routing settings)
- Add DMARC record: `v=DMARC1; p=none;`

**Step 5** — Deploy and create mailboxes:

```bash
wrangler deploy --env bach-asia
```

Visit the UI → create mailboxes for addresses on the new domain.

### When to Use Pattern B

- Personal use with multiple domains
- Same owner/team manages all domains
- Want single dashboard for all mailboxes

### When to Use Pattern A Instead

- Different teams per domain need separate access control
- Need isolated storage and billing per domain
- Compliance requires data separation
