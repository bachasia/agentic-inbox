---
phase: 2
title: "Labels Full Stack"
status: complete
priority: P1
effort: "4h"
dependencies: [phase-01-db-migrations-schema]
---

# Phase 2: Labels Full Stack

## Overview

Multi-label system with color + name. Users create labels in settings, apply them to emails via toolbar, filter inbox by label. All layers: DO methods → API routes → TanStack Query hooks → frontend components.

## Requirements

- Functional:
  - CRUD labels (create/rename/delete, name + hex color)
  - Apply/remove label on any email
  - List labels on an email (returned alongside email data)
  - Filter email list by label in sidebar
  - Labels displayed as colored badges on email list rows
  - Labels section in settings page
- Non-functional:
  - Label slugs: lowercase kebab-case derived from name (e.g. "Work" → "work")
  - Delete label cascades email_labels rows (FK already handles it)
  - Max 20 labels per mailbox

## Architecture

```
workers/durableObject/index.ts   ← label + email_label DO methods
workers/index.ts                 ← API routes for labels
app/types/index.ts               ← Label type (already added in phase 1)
app/services/api.ts              ← label API methods
app/queries/labels.ts            ← TanStack Query hooks
app/queries/keys.ts              ← queryKey for labels
app/components/LabelBadge.tsx    ← colored chip component
app/components/LabelPicker.tsx   ← dropdown to apply/remove labels on email
app/routes/settings.tsx          ← Labels section
app/components/Sidebar.tsx       ← label filter links
app/routes/email-list.tsx        ← render label badges on email rows
```

## Related Code Files

- Modify: `workers/durableObject/index.ts`
- Modify: `workers/index.ts`
- Modify: `app/services/api.ts`
- Modify: `app/queries/keys.ts`
- Modify: `app/routes/settings.tsx`
- Modify: `app/components/Sidebar.tsx`
- Modify: `app/routes/email-list.tsx`
- Create: `app/queries/labels.ts`
- Create: `app/components/LabelBadge.tsx`
- Create: `app/components/LabelPicker.tsx`

## Implementation Steps

### 1. DO Methods (`workers/durableObject/index.ts`)

Add after existing methods:

```ts
// ── Labels ────────────────────────────────────────────────────────

async listLabels() {
  return this.db.select().from(schema.labels).orderBy(asc(schema.labels.name)).all();
}

async createLabel(id: string, name: string, color: string) {
  const existing = this.db.select({ id: schema.labels.id }).from(schema.labels).all();
  if (existing.length >= 20) throw new Error("Max 20 labels per mailbox");
  try {
    return this.db.insert(schema.labels).values({ id, name, color })
      .returning().get();
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("UNIQUE")) return null; // duplicate
    throw e;
  }
}

async updateLabel(id: string, name: string, color: string) {
  return this.db.update(schema.labels).set({ name, color })
    .where(eq(schema.labels.id, id)).returning().get() ?? null;
}

async deleteLabel(id: string) {
  const r = this.db.delete(schema.labels).where(eq(schema.labels.id, id))
    .returning({ id: schema.labels.id }).get();
  return !!r;
}

// Thread-level: apply label to all emails sharing the same thread_id
async applyLabel(emailId: string, labelId: string) {
  // Resolve thread_id for this email
  const email = this.db.select({ thread_id: schema.emails.thread_id })
    .from(schema.emails).where(eq(schema.emails.id, emailId)).get();
  const threadId = email?.thread_id || emailId;

  const threadEmails = this.ctx.storage.sql.exec(
    `SELECT id FROM emails WHERE thread_id = ?1 OR id = ?1`, threadId,
  );
  for (const row of threadEmails as any) {
    try {
      this.db.insert(schema.emailLabels).values({ email_id: row.id, label_id: labelId }).run();
    } catch { /* already applied to this email — skip */ }
  }
  return true;
}

// Thread-level: remove label from all emails in the same thread
async removeLabel(emailId: string, labelId: string) {
  const email = this.db.select({ thread_id: schema.emails.thread_id })
    .from(schema.emails).where(eq(schema.emails.id, emailId)).get();
  const threadId = email?.thread_id || emailId;

  this.ctx.storage.sql.exec(
    `DELETE FROM email_labels WHERE label_id = ?1 AND email_id IN (SELECT id FROM emails WHERE thread_id = ?2 OR id = ?2)`,
    labelId, threadId,
  );
  return true;
}

async getEmailLabels(emailId: string) {
  return this.db.select({ id: schema.labels.id, name: schema.labels.name, color: schema.labels.color })
    .from(schema.emailLabels)
    .innerJoin(schema.labels, eq(schema.emailLabels.label_id, schema.labels.id))
    .where(eq(schema.emailLabels.email_id, emailId)).all();
}
```

Extend `getEmails` and `getEmail` to join labels:
- In `getEmail`: after fetching email, run `getEmailLabels(id)` and attach as `labels`.
- In `getEmails` list view: add a subquery or secondary query to batch-fetch labels for page of emails (use same pattern as `getThreadEmails` attachment batch-fetch).

Add filter by label to `getEmails` / `getThreadedEmails`:
```ts
// In GetEmailsOptions:
label_id?: string;

// In WHERE conditions:
if (label_id) {
  conditions.push(sql`${schema.emails.id} IN (SELECT email_id FROM email_labels WHERE label_id = ${label_id})`);
}
```

### 2. API Routes (`workers/index.ts`)

```ts
// Labels
app.get("/api/v1/mailboxes/:mailboxId/labels", async (c: AppContext) =>
  c.json(await (c.var.mailboxStub as any).listLabels()));

app.post("/api/v1/mailboxes/:mailboxId/labels", async (c: AppContext) => {
  const { name, color = "#6366f1" } = await c.req.json() as { name: string; color?: string };
  if (!name?.trim()) return c.json({ error: "name required" }, 400);
  const id = slugify(name);
  if (!id) return c.json({ error: "name must contain alphanumeric chars" }, 400);
  const label = await (c.var.mailboxStub as any).createLabel(id, name.trim(), color);
  return label ? c.json(label, 201) : c.json({ error: "Label already exists or limit reached" }, 409);
});

app.put("/api/v1/mailboxes/:mailboxId/labels/:id", async (c: AppContext) => {
  const { name, color } = await c.req.json() as { name: string; color: string };
  const label = await (c.var.mailboxStub as any).updateLabel(c.req.param("id")!, name, color);
  return label ? c.json(label) : c.json({ error: "Not found" }, 404);
});

app.delete("/api/v1/mailboxes/:mailboxId/labels/:id", async (c: AppContext) => {
  const ok = await (c.var.mailboxStub as any).deleteLabel(c.req.param("id")!);
  return ok ? c.body(null, 204) : c.json({ error: "Not found" }, 404);
});

app.post("/api/v1/mailboxes/:mailboxId/emails/:id/labels", async (c: AppContext) => {
  const { labelId } = await c.req.json() as { labelId: string };
  await (c.var.mailboxStub as any).applyLabel(c.req.param("id")!, labelId);
  return c.json({ status: "applied" });
});

app.delete("/api/v1/mailboxes/:mailboxId/emails/:id/labels/:labelId", async (c: AppContext) => {
  await (c.var.mailboxStub as any).removeLabel(c.req.param("id")!, c.req.param("labelId")!);
  return c.body(null, 204);
});
```

### 3. API Client (`app/services/api.ts`)

```ts
// Labels
listLabels: (mailboxId: string) =>
  get<Label[]>(`/api/v1/mailboxes/${mailboxId}/labels`),
createLabel: (mailboxId: string, name: string, color: string) =>
  post<Label>(`/api/v1/mailboxes/${mailboxId}/labels`, { name, color }),
updateLabel: (mailboxId: string, id: string, name: string, color: string) =>
  put<Label>(`/api/v1/mailboxes/${mailboxId}/labels/${id}`, { name, color }),
deleteLabel: (mailboxId: string, id: string) =>
  del<void>(`/api/v1/mailboxes/${mailboxId}/labels/${id}`),
applyLabel: (mailboxId: string, emailId: string, labelId: string) =>
  post<void>(`/api/v1/mailboxes/${mailboxId}/emails/${emailId}/labels`, { labelId }),
removeLabel: (mailboxId: string, emailId: string, labelId: string) =>
  del<void>(`/api/v1/mailboxes/${mailboxId}/emails/${emailId}/labels/${labelId}`),
```

### 4. Query Hooks (`app/queries/labels.ts`)

```ts
export const LABELS_KEY = (mailboxId: string) => ["mailboxes", mailboxId, "labels"];

export function useLabels(mailboxId?: string) {
  return useQuery({
    queryKey: LABELS_KEY(mailboxId!),
    queryFn: () => api.listLabels(mailboxId!),
    enabled: !!mailboxId,
  });
}

export function useCreateLabel(mailboxId: string) { /* useMutation wrapping api.createLabel, invalidates LABELS_KEY */ }
export function useUpdateLabel(mailboxId: string) { /* useMutation */ }
export function useDeleteLabel(mailboxId: string) { /* useMutation */ }
export function useApplyLabel(mailboxId: string) { /* useMutation, invalidates email + list queries */ }
export function useRemoveLabel(mailboxId: string) { /* useMutation, invalidates email + list queries */ }
```

Add `"labels"` to `app/queries/keys.ts` query key factory.

### 5. `LabelBadge.tsx` Component

```tsx
// Small colored chip: rounded pill, background = label.color at 15% opacity, text = label.color
interface LabelBadgeProps { label: Label; onRemove?: () => void; size?: "sm" | "xs" }
```

### 6. `LabelPicker.tsx` Component

Dropdown triggered by a tag icon button. Shows all mailbox labels with checkboxes. Checks which are applied to the current email. Calls `useApplyLabel`/`useRemoveLabel` on toggle. Used in `EmailPanelToolbar`.

### 7. Frontend Integration

**`app/components/Sidebar.tsx`**: After the system folders list, add a "Labels" section:
- List all labels as nav links: `?label=<id>` query param
- Colored dot + label name

**`app/routes/email-list.tsx`**: In each email row, after the existing subject/snippet, render `<LabelBadge>` for each label (from `email.labels`).

**`app/components/email-panel/EmailPanelToolbar.tsx`**: Add `<LabelPicker>` button next to existing toolbar buttons.

**`app/routes/settings.tsx`**: Add "Labels" section card with:
- List existing labels (color dot + name + edit + delete)
- "Add label" form: name input + color picker (simple `<input type="color">`) + save button

Pass `label_id` from URL query param through to `useEmails` hook so filtering works.

## Success Criteria

- [ ] Can create/rename/delete labels in settings
- [ ] Can apply/remove labels on emails via toolbar dropdown
- [ ] Labels appear as colored badges on email list rows
- [ ] Sidebar shows label links; clicking filters email list to that label
- [ ] `getEmails` with `label_id` param returns only labeled emails
- [ ] Deleting a label removes it from all emails (CASCADE verified)
- [ ] Max 20 labels enforced at API level

## Risk Assessment

- Batch-fetching labels for email list: avoid N+1 — use a single `SELECT * FROM email_labels WHERE email_id IN (...)` query, same pattern as attachment batch-fetch in `getThreadEmails`
- Color picker: browser native `<input type="color">` is sufficient; no extra library
- `slugify` for label ID: reuse the existing `slugify` helper already in `workers/index.ts`
- Thread-level apply/remove: the `applyLabel` and `removeLabel` now operate on all emails in the thread. The `LabelPicker` should still be triggered from a single email (the selected one) — the UI doesn't need to change.
