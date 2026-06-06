---
phase: 4
title: "Frontend Settings UI"
status: pending
effort: "3h"
dependencies: [3]
---

# Phase 4: Frontend Settings UI

## Overview

Add a "Knowledge Base" section to the mailbox settings page. Extracted into a separate component (`knowledge-base-settings-section.tsx`) to keep `settings.tsx` under the 200-line modularization limit. Supports list/create/edit/delete articles with category selector.

## Requirements

- Functional: list articles (title, category, updatedAt)
- Functional: create article (title, content textarea, category select)
- Functional: edit article inline or via modal
- Functional: delete with confirmation
- Non-functional: `settings.tsx` must not exceed 200 LOC after change

## Architecture

### API client (app/services/api.ts)

```ts
listKbArticles: (mailboxId: string) =>
  get<KbArticle[]>(`/api/v1/mailboxes/${mailboxId}/knowledge`),

createKbArticle: (mailboxId: string, data: KbArticleInput) =>
  post<{ id: string }>(`/api/v1/mailboxes/${mailboxId}/knowledge`, data),

updateKbArticle: (mailboxId: string, articleId: string, data: KbArticleInput) =>
  put<KbArticle>(`/api/v1/mailboxes/${mailboxId}/knowledge/${articleId}`, data),

deleteKbArticle: (mailboxId: string, articleId: string) =>
  del(`/api/v1/mailboxes/${mailboxId}/knowledge/${articleId}`),
```

### Types (app/types/index.ts)

```ts
export interface KbArticle {
  id: string;
  title: string;
  content: string;
  category: "brand" | "product" | "policy" | "faq";
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface KbArticleInput {
  title: string;
  content: string;
  category: KbArticle["category"];
}
```

### Component structure

```
app/components/settings/knowledge-base-settings-section.tsx
  Props: { mailboxId: string }
  State:
    - articles: KbArticle[]
    - editingArticle: KbArticle | null   (null = create mode)
    - isFormOpen: boolean
    - isDeleting: string | null          (articleId being deleted)
  Sections:
    - Header + "Add Article" button
    - Article list (table: title, category badge, updatedAt, Edit/Delete buttons)
    - Create/Edit form (title input, category select, content textarea, Save/Cancel)
```

Category badge colors (using Kumo Badge): brand=purple, product=blue, policy=orange, faq=green

### Integration in settings.tsx

```tsx
import KnowledgeBaseSettingsSection from "~/components/settings/knowledge-base-settings-section";
// ...
<KnowledgeBaseSettingsSection mailboxId={mailboxId!} />
```

No state plumbing needed — component is self-contained.

## Related Code Files

- Create: `app/components/settings/knowledge-base-settings-section.tsx`
- Modify: `app/services/api.ts` — add KB API methods
- Modify: `app/types/index.ts` — add `KbArticle`, `KbArticleInput`
- Modify: `app/routes/settings.tsx` — import + render KB section

## Implementation Steps

1. Add `KbArticle` and `KbArticleInput` to `app/types/index.ts`

2. Add KB API methods to `app/services/api.ts` following existing patterns (`get`, `post`, `put`, `del`)

3. Create `app/components/settings/knowledge-base-settings-section.tsx`:
   - Self-contained: fetches own data via `useEffect` + `api.listKbArticles`
   - Uses Kumo components (`Button`, `Input`, `Badge`, `useKumoToastManager`) matching the rest of settings
   - Form: title `<Input>`, category `<select>` (or Kumo select), content `<textarea>`
   - Delete: confirm with `window.confirm` (consistent with existing pattern in settings)
   - Show loading spinner (`<Loader>`) while fetching

4. Import and render `<KnowledgeBaseSettingsSection mailboxId={mailboxId!} />` in `app/routes/settings.tsx` below the WooCommerce section

5. Run `npx tsc --noEmit`

## Success Criteria

- [ ] KB section renders in settings page without errors
- [ ] Creating an article calls POST and shows it in the list
- [ ] Editing pre-fills the form and calls PUT
- [ ] Deleting removes from list after confirmation
- [ ] `settings.tsx` stays under 200 LOC after changes
- [ ] `npx tsc --noEmit` passes

## Risk Assessment

- Settings page at 479 LOC — already over limit. Adding KB inline would worsen it. KB as self-contained component keeps settings.tsx lean (adds ~5 lines to wire up).
- Kumo component library used throughout; no new UI dependencies needed.
