# Phase 05: Backup & Export

## Context Links
- [Plan overview](./plan.md)
- [RFC 4155 - mbox format](https://datatracker.ietf.org/doc/html/rfc4155)
- [RFC 2822 - EML format](https://datatracker.ietf.org/doc/html/rfc2822)
- MailboxDO: `workers/durableObject/index.ts` (1694 lines)
- Email schema: `workers/db/schema.ts:13-38`
- R2 attachments: `workers/lib/attachments.ts`

## Overview
- **Priority:** P2
- **Status:** pending
- **Effort:** 3h
- **Description:** Export all emails from a mailbox as individual EML files bundled in a ZIP. EML is simpler than mbox, universally supported by email clients (Thunderbird, Outlook, Apple Mail), and handles attachments cleanly. No periodic R2 backup of DO SQLite -- Cloudflare manages DO durability natively (YAGNI).
- **Dependencies:** None (independent)

## Key Insights

### Why EML-in-ZIP, Not mbox
- mbox format requires escaping `From ` lines and concatenating -- error-prone for binary attachments
- Individual EML files are easier to re-import and debug
- ZIP compression is built into Cloudflare Workers via `CompressionStream` (or a lightweight library)
- Each EML file = one email, named `{date}_{subject_slug}_{id}.eml`

### Why No DO SQLite Backup
- Cloudflare Durable Objects provide built-in durability and point-in-time recovery
- DO SQLite data is replicated across CF's infrastructure
- Adding periodic R2 snapshots adds complexity with minimal benefit (YAGNI)
- If a user wants a backup, they can use the export endpoint to get all their emails

### Export Size Concerns
- Workers have 128MB memory limit and 30s CPU time limit (or 15min for Cron Triggers)
- Large mailboxes (10k+ emails) with attachments could exceed memory
- Solution: stream the ZIP response using `TransformStream`, fetch emails in batches

### Data Available for Export
From `workers/db/schema.ts:13-38` (`emails` table):
- `id`, `subject`, `sender`, `recipient`, `cc`, `bcc`, `date`, `body` (HTML)
- `message_id`, `in_reply_to`, `email_references`, `raw_headers`
- Attachments via `attachments` table: `filename`, `mimetype`, `size`, stored in R2 at `attachments/{emailId}/{attId}/{filename}`

## Requirements

### Functional
- `GET /api/v1/mailboxes/:mailboxId/export` endpoint returns a ZIP file containing EML files
- Each email becomes one `.eml` file with proper RFC 2822 headers
- Attachments included as MIME parts (base64-encoded in EML)
- Optional `folder` query param to export only one folder
- Response streams as `application/zip` with `Content-Disposition: attachment`

### Non-Functional
- Handles mailboxes up to 5000 emails without timeout (streaming response)
- Emails fetched in batches of 100 to avoid memory spikes
- Attachments fetched from R2 on-demand per email
- Request protected by existing Cloudflare Access auth middleware

## Architecture

### API Design
```
GET /api/v1/mailboxes/:mailboxId/export
  ?folder=inbox        (optional: filter by folder)
  
Response:
  Content-Type: application/zip
  Content-Disposition: attachment; filename="mailbox-export-{mailboxId}-{date}.zip"
  Body: ZIP stream of .eml files
```

### EML Format
Each email is serialized to RFC 2822 format:
```
From: sender@example.com
To: recipient@example.com
Cc: cc@example.com
Subject: Re: Project update
Date: Tue, 03 Jun 2026 09:04:00 +0000
Message-ID: <uuid@domain.com>
In-Reply-To: <original-id@domain.com>
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="----boundary123"

------boundary123
Content-Type: text/html; charset=utf-8

<html>email body</html>

------boundary123
Content-Type: application/pdf; name="report.pdf"
Content-Disposition: attachment; filename="report.pdf"
Content-Transfer-Encoding: base64

SGVsbG8gV29ybGQ=...
------boundary123--
```

### Data Flow
```
Client GET /export
  ↓
Hono route handler
  ↓
Fetch email count from DO → determine batch count
  ↓
For each batch of 100 emails:
  ├── Fetch emails from DO (getEmails with pagination)
  ├── For each email:
  │   ├── Fetch attachments metadata from DO
  │   ├── Fetch attachment blobs from R2
  │   ├── Build EML string (headers + MIME body + attachments)
  │   └── Write EML to ZIP stream
  └── Continue to next batch
  ↓
Stream ZIP response to client
```

### ZIP Strategy
Use a lightweight streaming ZIP implementation. Options:
1. **`fflate`** -- popular, tree-shakeable, works in Workers (~8KB gzipped)
2. **Manual ZIP** -- Workers support `CompressionStream("deflate-raw")` but building ZIP headers manually is complex

Recommendation: use `fflate` (or `@aspect-build/rules_js` zip helpers) for reliability. KISS over hand-rolling ZIP.

## Related Code Files

### Files to Create
| File | Purpose | Est. Lines |
|------|---------|-----------|
| `workers/lib/email-export.ts` | EML builder + ZIP export logic | ~120 |

### Files to Modify
| File | Change |
|------|--------|
| `workers/index.ts` | Add `GET /api/v1/mailboxes/:mailboxId/export` route (~15 lines) |
| `package.json` | Add `fflate` dependency |

### Files to Read (context)
| File | Why |
|------|-----|
| `workers/db/schema.ts` | Email and attachment table schema |
| `workers/durableObject/index.ts` | `getEmails`, `getAttachment` methods |
| `workers/lib/attachments.ts` | R2 attachment storage format |
| `workers/lib/email-helpers.ts:156-164` | `escapeHtml` for header encoding |

## Implementation Steps

### Step 1: Install `fflate`
```bash
npm install fflate
```

### Step 2: Create `workers/lib/email-export.ts`

Core functions:

**`buildEmlContent(email, attachmentBlobs)`** (~60 lines)
- Build RFC 2822 headers from email metadata
- If no attachments: single-part `Content-Type: text/html`
- If attachments: `multipart/mixed` with boundary
- Body part: HTML content as `text/html; charset=utf-8`
- Attachment parts: base64-encoded with proper MIME headers
- Return complete EML string

**`sanitizeFilename(subject, id)`** (~5 lines)
- Strip non-alphanumeric characters from subject
- Truncate to 50 chars
- Format: `{YYYY-MM-DD}_{slug}_{id-prefix}.eml`

**`exportMailboxToZip(stub, bucket, options)`** (~50 lines)
- Fetch emails in batches of 100 (paginated)
- For each email, fetch attachment blobs from R2
- Build EML content
- Add to ZIP using `fflate.zipSync` or streaming equivalent
- Return Uint8Array of ZIP data

### Step 3: Add export route to `workers/index.ts`

```ts
app.get("/api/v1/mailboxes/:mailboxId/export", async (c: AppContext) => {
  const mailboxId = c.req.param("mailboxId")!;
  const folder = c.req.query("folder");
  const stub = c.var.mailboxStub;
  
  const zipData = await exportMailboxToZip(stub, c.env.BUCKET, { folder });
  
  const date = new Date().toISOString().slice(0, 10);
  return new Response(zipData, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="mailbox-export-${mailboxId}-${date}.zip"`,
    },
  });
});
```

### Step 4: Add export button to frontend (optional, low priority)

Could add an "Export" button in Settings page. But the API endpoint is functional on its own -- frontend button can be deferred. The endpoint is accessible via curl or browser URL.

### Step 5: Verify
- Export a test mailbox with a few emails + attachments
- Verify ZIP downloads correctly
- Open individual EML files in Thunderbird or mail client
- Verify attachments are intact

## Todo List

- [ ] Install `fflate` dependency
- [ ] Create `workers/lib/email-export.ts` with `buildEmlContent` and `exportMailboxToZip`
- [ ] Add export route to `workers/index.ts`
- [ ] Run typecheck
- [ ] Manual test: export mailbox with plain emails
- [ ] Manual test: export mailbox with attachments
- [ ] Manual test: open exported EML in email client

## Success Criteria

1. `GET /api/v1/mailboxes/:id/export` returns a valid ZIP file
2. ZIP contains one `.eml` file per email
3. EML files are valid RFC 2822 and importable in Thunderbird/Apple Mail
4. Attachments are included as base64 MIME parts
5. `?folder=inbox` filter works correctly
6. Export of 100-email mailbox completes in <10s
7. `npm run typecheck` passes

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Memory exhaustion on large mailbox export | Medium | High | Batch emails in pages of 100; if mailbox >5000, return 413 with message |
| Workers CPU time limit (30s) exceeded | Medium | High | Batch processing + streaming; warn in docs about large exports |
| R2 attachment fetch latency | Low | Medium | Parallel fetch within each batch (Promise.all for attachments of one email) |
| `fflate` not compatible with Workers runtime | Low | Medium | `fflate` works in any JS environment (no Node APIs); tested in CF Workers |
| EML format edge cases (non-ASCII headers, binary attachments) | Medium | Low | Use RFC 2047 encoded-word for non-ASCII subjects; base64 for all attachments |

## Security Considerations
- Export endpoint is behind Cloudflare Access middleware (verified at `workers/app.ts:46-81`)
- Export endpoint uses `requireMailbox` middleware (verified at `workers/index.ts:88`) which checks mailbox exists in R2
- No rate limiting on export -- acceptable since Access limits who can call it, but consider adding if abuse is a concern
- Exported ZIP contains full email bodies including any sensitive content -- user is responsible for securing the download
- `Content-Disposition: attachment` prevents browser from rendering the ZIP inline
