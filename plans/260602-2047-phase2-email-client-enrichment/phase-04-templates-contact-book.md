---
phase: 4
title: "Templates & Contact Book"
status: complete
priority: P2
effort: "5h"
dependencies: [phase-01-db-migrations-schema]
---

# Phase 4: Templates & Contact Book

## Overview

Two independent features that both touch the compose flow. Templates are R2-stored JSON (no DB needed); contacts live in DO SQLite and are auto-extracted from every inbound/outbound email. Both surface in ComposePanel — template dropdown for one-click body population, contact autocomplete for To/Cc/Bcc fields.

## Requirements

### Templates
- CRUD: create, list, update, delete reusable email templates (name, subject, body HTML)
- Template picker in ComposePanel — selecting populates subject + body
- Stored in mailbox R2 settings JSON under `templates[]` key
- Max 50 templates per mailbox

### Contact Book
- `contacts` table already created in Phase 1 (migration 11)
- Auto-upsert contacts on every `receiveEmail()` (from-address) and every outbound send (to/cc/bcc addresses)
- CRUD: list, search, update name, delete contact
- Contact search autocomplete in To/Cc/Bcc inputs in ComposePanel
- Contact detail not required (list + search only for Phase 2)

## Architecture

```
Templates (R2-based)
  MailboxSettings.templates[]  ← array in existing R2 JSON
  API: GET/POST/PUT/DELETE /templates
  Frontend: template picker dropdown in ComposePanel

Contacts (DO SQLite)
  contacts table (migration 11)
  Auto-extraction: receiveEmail() + createEmail(SENT) hooks
  API: GET /contacts?q=... , GET /contacts, POST /contacts, PUT /contacts/:id, DELETE /contacts/:id
  Frontend: autocomplete component in To/Cc/Bcc fields
```

## Related Code Files

### Templates
- Modify: `app/types/index.ts` — add `EmailTemplate` type + extend `MailboxSettings`
- Modify: `workers/index.ts` — template CRUD API routes
- Modify: `app/services/api.ts` — template API methods
- Create: `app/queries/templates.ts` — TanStack Query hooks
- Modify: `app/components/ComposePanel.tsx` — template picker UI
- Modify: `app/hooks/useComposeForm.ts` — applyTemplate handler

### Contact Book
- Modify: `workers/durableObject/index.ts` — contact DO methods
- Modify: `workers/index.ts` — receiveEmail contact extraction + contact API routes
- Modify: `app/services/api.ts` — contact API methods
- Create: `app/queries/contacts.ts` — TanStack Query hooks
- Create: `app/components/ContactAutocomplete.tsx` — autocomplete input component
- Modify: `app/components/ComposePanel.tsx` — swap plain To/Cc/Bcc inputs for `ContactAutocomplete`

## Implementation Steps

### Part A: Email Templates

#### 1. Types (`app/types/index.ts`)

```ts
export interface EmailTemplate {
  id: string;       // uuid
  name: string;     // display name
  subject: string;
  body: string;     // HTML
}
```

In `MailboxSettings`:
```ts
templates?: EmailTemplate[];
```

#### 2. API Routes (`workers/index.ts`)

Templates are read/written as part of the mailbox settings R2 blob. Keep them in a sub-key.

Template routes are NOT behind `requireMailbox` middleware (they access R2 directly), but they **must** validate the mailbox exists via a lightweight `BUCKET.head()` check before reading/writing:

```ts
// Helper: validate mailbox exists and read templates array from R2
// Returns null if mailbox not found (caller returns 404)
async function getMailboxTemplates(
  bucket: R2Bucket, mailboxId: string,
): Promise<EmailTemplate[] | null> {
  const obj = await bucket.get(`mailboxes/${mailboxId}.json`);
  if (!obj) return null;  // mailbox does not exist
  const settings = await obj.json() as Record<string, any>;
  return (settings.templates as EmailTemplate[]) ?? [];
}

async function saveTemplates(bucket: R2Bucket, mailboxId: string, templates: EmailTemplate[]) {
  const obj = await bucket.get(`mailboxes/${mailboxId}.json`);
  const settings = obj ? await obj.json() as Record<string, any> : {};
  await bucket.put(`mailboxes/${mailboxId}.json`, JSON.stringify({ ...settings, templates }));
}

app.get("/api/v1/mailboxes/:mailboxId/templates", async (c) => {
  const templates = await getMailboxTemplates(c.env.BUCKET, c.req.param("mailboxId")!);
  if (templates === null) return c.json({ error: "Mailbox not found" }, 404);
  return c.json(templates);
});

app.post("/api/v1/mailboxes/:mailboxId/templates", async (c) => {
  const { name, subject, body } = await c.req.json() as { name: string; subject: string; body: string };
  const templates = await getMailboxTemplates(c.env.BUCKET, c.req.param("mailboxId")!);
  if (templates === null) return c.json({ error: "Mailbox not found" }, 404);
  if (templates.length >= 50) return c.json({ error: "Max 50 templates" }, 409);
  const template: EmailTemplate = { id: crypto.randomUUID(), name, subject, body };
  await saveTemplates(c.env.BUCKET, c.req.param("mailboxId")!, [...templates, template]);
  return c.json(template, 201);
});

app.put("/api/v1/mailboxes/:mailboxId/templates/:id", async (c) => {
  const id = c.req.param("id")!;
  const { name, subject, body } = await c.req.json() as { name: string; subject: string; body: string };
  const templates = await getMailboxTemplates(c.env.BUCKET, c.req.param("mailboxId")!);
  if (templates === null) return c.json({ error: "Mailbox not found" }, 404);
  const idx = templates.findIndex((t) => t.id === id);
  if (idx === -1) return c.json({ error: "Not found" }, 404);
  templates[idx] = { id, name, subject, body };
  await saveTemplates(c.env.BUCKET, c.req.param("mailboxId")!, templates);
  return c.json(templates[idx]);
});

app.delete("/api/v1/mailboxes/:mailboxId/templates/:id", async (c) => {
  const id = c.req.param("id")!;
  const templates = await getMailboxTemplates(c.env.BUCKET, c.req.param("mailboxId")!);
  if (templates === null) return c.json({ error: "Mailbox not found" }, 404);
  const filtered = templates.filter((t) => t.id !== id);
  if (filtered.length === templates.length) return c.json({ error: "Not found" }, 404);
  await saveTemplates(c.env.BUCKET, c.req.param("mailboxId")!, filtered);
  return c.body(null, 204);
});
```

Note: template routes don't require `requireMailbox` middleware (they access R2 directly like the mailbox settings routes). Add them before the middleware-guarded routes or handle appropriately.

#### 3. API Client (`app/services/api.ts`)

```ts
listTemplates: (mailboxId: string) =>
  get<EmailTemplate[]>(`/api/v1/mailboxes/${mailboxId}/templates`),
createTemplate: (mailboxId: string, t: Omit<EmailTemplate, "id">) =>
  post<EmailTemplate>(`/api/v1/mailboxes/${mailboxId}/templates`, t),
updateTemplate: (mailboxId: string, id: string, t: Omit<EmailTemplate, "id">) =>
  put<EmailTemplate>(`/api/v1/mailboxes/${mailboxId}/templates/${id}`, t),
deleteTemplate: (mailboxId: string, id: string) =>
  del<void>(`/api/v1/mailboxes/${mailboxId}/templates/${id}`),
```

#### 4. Query Hooks (`app/queries/templates.ts`)

Standard TanStack Query pattern: `useTemplates`, `useCreateTemplate`, `useUpdateTemplate`, `useDeleteTemplate`. Query key: `["mailboxes", mailboxId, "templates"]`.

#### 5. ComposePanel Template Picker

In `ComposePanel.tsx`, add a template select dropdown in the toolbar area (above the editor):
```tsx
{templates.length > 0 && (
  <select onChange={(e) => applyTemplate(e.target.value)} className="...">
    <option value="">Use template...</option>
    {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
  </select>
)}
```

In `useComposeForm.ts`, add `applyTemplate(id)`:
```ts
const applyTemplate = (templateId: string) => {
  const t = templates.find((t) => t.id === templateId);
  if (!t) return;
  if (!subject) setSubject(t.subject); // don't overwrite if already set
  setBody(t.body);
};
```

#### 6. Settings page — Templates section

Add a "Templates" card in `settings.tsx`:
- List templates: name + edit icon + delete icon
- "New template" form: name input + subject input + RichTextEditor body + Save

---

### Part B: Contact Book

#### 1. DO Methods (`workers/durableObject/index.ts`)

```ts
// ── Contacts ──────────────────────────────────────────────────────

async upsertContact(email: string, name?: string) {
  const now = new Date().toISOString();
  const existing = this.db.select().from(schema.contacts)
    .where(eq(schema.contacts.email, email.toLowerCase())).get();
  if (existing) {
    this.db.update(schema.contacts)
      .set({
        frequency: existing.frequency + 1,
        last_seen: now,
        // Only update name if we have one and existing doesn't
        ...(name && !existing.name ? { name } : {}),
      })
      .where(eq(schema.contacts.id, existing.id)).run();
  } else {
    this.db.insert(schema.contacts).values({
      id: crypto.randomUUID(),
      email: email.toLowerCase(),
      name: name || null,
      frequency: 1,
      last_seen: now,
    }).run();
  }
}

async searchContacts(query: string, limit = 10): Promise<Contact[]> {
  const q = `%${query.toLowerCase()}%`;
  return this.ctx.storage.sql.exec(
    `SELECT * FROM contacts WHERE LOWER(email) LIKE ?1 OR LOWER(COALESCE(name,'')) LIKE ?1
     ORDER BY frequency DESC, last_seen DESC LIMIT ?2`,
    q, limit,
  ) as any;
}

async listContacts(page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  return [...this.ctx.storage.sql.exec(
    `SELECT * FROM contacts ORDER BY frequency DESC, last_seen DESC LIMIT ?1 OFFSET ?2`,
    limit, offset,
  )] as Contact[];
}

async updateContact(id: string, name: string) {
  return this.db.update(schema.contacts).set({ name })
    .where(eq(schema.contacts.id, id)).returning().get() ?? null;
}

async deleteContact(id: string) {
  const r = this.db.delete(schema.contacts)
    .where(eq(schema.contacts.id, id)).returning({ id: schema.contacts.id }).get();
  return !!r;
}
```

#### 2. Auto-extraction Hooks

Add a noreply filter helper in `workers/index.ts`:
```ts
const NOREPLY_PATTERNS = /noreply|no-reply|donotreply|mailer-daemon|bounce|notifications?@|alerts?@/i;

function isAutoSender(address: string): boolean {
  return NOREPLY_PATTERNS.test(address);
}
```

In `workers/index.ts`, `receiveEmail()` — after `stub.createEmail(...)`:
```ts
// Extract sender as contact (skip automated senders)
const senderAddr = (parsedEmail.from?.address || "").toLowerCase();
if (senderAddr && !isAutoSender(senderAddr)) {
  ctx.waitUntil(
    stub.upsertContact(senderAddr, parsedEmail.from?.name || undefined)
      .catch((e: Error) => console.error("Contact upsert failed:", e.message)),
  );
}
```

In `workers/index.ts`, `POST /emails` (send) handler — after `stub.createEmail(SENT, ...)`:
```ts
// Extract recipients as contacts (outbound addresses are always real humans — skip noreply filter)
const allRecipients = [to, ...(Array.isArray(cc) ? cc : cc ? [cc] : []), ...(Array.isArray(bcc) ? bcc : bcc ? [bcc] : [])].flat();
ctx.executionCtx.waitUntil(
  Promise.all(allRecipients.map((addr) => {
    const email = typeof addr === "string" ? addr : addr.email;
    return stub.upsertContact(email).catch(() => {});
  }))
);
```

#### 3. Contact API Routes (`workers/index.ts`)

```ts
app.get("/api/v1/mailboxes/:mailboxId/contacts", async (c: AppContext) => {
  const q = c.req.query("q");
  const stub = c.var.mailboxStub as any;
  const contacts = q
    ? await stub.searchContacts(q, 10)
    : await stub.listContacts(intQuery(c, "page"), intQuery(c, "limit"));
  return c.json(contacts);
});

app.put("/api/v1/mailboxes/:mailboxId/contacts/:id", async (c: AppContext) => {
  const { name } = await c.req.json() as { name: string };
  const contact = await (c.var.mailboxStub as any).updateContact(c.req.param("id")!, name);
  return contact ? c.json(contact) : c.json({ error: "Not found" }, 404);
});

app.delete("/api/v1/mailboxes/:mailboxId/contacts/:id", async (c: AppContext) => {
  const ok = await (c.var.mailboxStub as any).deleteContact(c.req.param("id")!);
  return ok ? c.body(null, 204) : c.json({ error: "Not found" }, 404);
});
```

#### 4. `ContactAutocomplete.tsx` Component

Replaces the plain `<Input>` for To/Cc/Bcc in ComposePanel:
- Controlled value: comma-separated address string (backward compatible)
- On input change: debounce 300ms, call `api.listContacts(mailboxId, { q })`, show dropdown
- Selecting a suggestion appends `Name <email>` to the field
- Close dropdown on Escape / blur
- Keep it simple: no chips/tags, just enhanced plain text input

```tsx
interface ContactAutocompleteProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mailboxId: string;
}
```

#### 5. ComposePanel Integration

Replace To/Cc/Bcc `<Input>` with `<ContactAutocomplete>`. Only To/Cc/Bcc fields — subject stays plain input.

## Success Criteria

### Templates
- [ ] Can create/edit/delete templates in settings
- [ ] Template dropdown appears in ComposePanel when templates exist
- [ ] Selecting a template fills subject + body
- [ ] Template body rendered in RichTextEditor correctly
- [ ] Max 50 templates enforced

### Contacts
- [ ] Sending an email auto-adds recipients to contact book
- [ ] Receiving an email auto-adds sender to contact book
- [ ] Typing in To/Cc/Bcc shows matching contacts dropdown
- [ ] Selecting a contact appends their address to the field
- [ ] Contact frequency increments on repeated interactions

## Risk Assessment

- **Template R2 read-modify-write race**: two concurrent settings saves could lose templates. Acceptable for single-user use. If needed later, add ETag conditional write.
- **ContactAutocomplete UX**: plain text input with overlay dropdown is simpler than chips; avoids breaking existing compose form state management.
- **Large contact books**: `searchContacts` query uses `LIKE` — fast enough for personal use (<10k contacts). No FTS index needed at this scale.
- **Template routes bypass `requireMailbox` middleware**: they access `c.env.BUCKET` directly. Mailbox-exists check is handled by `getMailboxTemplates` returning `null`. Must be registered before or separately from the `requireMailbox`-gated routes — check route ordering in `workers/index.ts`.
- **noreply filter**: applied to inbound senders only. Outbound recipients (people you email) are always real humans — no filter applied on send. The `NOREPLY_PATTERNS` regex covers common patterns; can be expanded later.
