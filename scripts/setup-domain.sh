#!/usr/bin/env bash
# Setup a new domain environment for Agentic Inbox.
# Usage: ./scripts/setup-domain.sh <slug> <domain>
# Example: ./scripts/setup-domain.sh example-com example.com
set -euo pipefail

SLUG="${1:-}"
DOMAIN="${2:-}"

if [[ -z "$SLUG" || -z "$DOMAIN" ]]; then
  echo "Usage: $0 <slug> <domain>"
  echo "  slug    kebab-case identifier, e.g. example-com"
  echo "  domain  domain name, e.g. example.com"
  exit 1
fi

BUCKET="agentic-inbox-${SLUG}"
INDEX="email-embeddings-${SLUG}"
ENV_NAME="agentic-inbox-${SLUG}"

echo ""
echo "=== Setting up Agentic Inbox for ${DOMAIN} ==="
echo "  Env slug  : ${SLUG}"
echo "  Worker    : ${ENV_NAME}"
echo "  R2 bucket : ${BUCKET}"
echo "  Vectorize : ${INDEX}"
echo ""

# ── 1. R2 bucket ──────────────────────────────────────────────────────────────
echo "[1/4] Creating R2 bucket: ${BUCKET}"
if wrangler r2 bucket list 2>/dev/null | grep -q "\"${BUCKET}\""; then
  echo "  already exists, skipping"
else
  wrangler r2 bucket create "${BUCKET}"
fi

# ── 2. Vectorize index ────────────────────────────────────────────────────────
echo "[2/4] Creating Vectorize index: ${INDEX}"
if wrangler vectorize list 2>/dev/null | grep -q "${INDEX}"; then
  echo "  already exists, skipping"
else
  wrangler vectorize create "${INDEX}" --dimensions 768 --metric cosine
  wrangler vectorize create-metadata-index "${INDEX}" \
    --property-name=mailboxId --type=string
fi

# ── 3. Add env block to wrangler.jsonc ────────────────────────────────────────
echo "[3/4] Checking wrangler.jsonc for env '${SLUG}'"
if grep -q "\"${SLUG}\"" wrangler.jsonc; then
  echo "  env '${SLUG}' already present in wrangler.jsonc, skipping"
else
  echo ""
  echo "  ACTION REQUIRED: Add the following block inside the \"env\": {} section of wrangler.jsonc:"
  echo ""
  cat <<EOF
    "${SLUG}": {
      "name": "${ENV_NAME}",
      "vars": {
        "DOMAINS": "${DOMAIN}",
        "EMAIL_ADDRESSES": []
      },
      "send_email": [{ "name": "EMAIL", "remote": true }],
      "r2_buckets": [
        {
          "binding": "BUCKET",
          "bucket_name": "${BUCKET}",
          "preview_bucket_name": "${BUCKET}"
        }
      ],
      "ai": { "binding": "AI" },
      "vectorize": [{ "binding": "VECTORIZE", "index_name": "${INDEX}" }],
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
EOF
  echo ""
  read -r -p "  Press Enter after updating wrangler.jsonc to continue..."
fi

# ── 4. Initial deploy ─────────────────────────────────────────────────────────
echo "[4/4] Deploying Worker: ${ENV_NAME}"
npm run build
wrangler deploy --env "${SLUG}"

echo ""
echo "=== Done! ==="
echo ""
echo "Next steps:"
echo "  1. Cloudflare dashboard → Workers → ${ENV_NAME} → Settings → Domains & Routes"
echo "     Enable one-click Cloudflare Access, then run:"
echo "       wrangler secret put POLICY_AUD --env ${SLUG}"
echo "       wrangler secret put TEAM_DOMAIN --env ${SLUG}"
echo "  2. Cloudflare dashboard → ${DOMAIN} → Email Routing"
echo "     Create catch-all rule → forward to Worker '${ENV_NAME}'"
echo "  3. Add '${SLUG}' to the DEPLOY_ENVS list in .github/workflows/ci.yml"
echo "     so future pushes auto-deploy this domain."
echo ""
