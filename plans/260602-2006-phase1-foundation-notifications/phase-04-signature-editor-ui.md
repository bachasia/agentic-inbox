---
phase: 4
title: "Signature Editor UI"
status: pending
priority: P2
effort: "3h"
dependencies: []
---

# Phase 4: Signature Editor UI

## Overview

Add a rich text signature editor with image upload support to the settings page. The backend infrastructure partially exists — `MailboxSettings.signature` has `enabled`, `text`, and `html` fields, and `getSignatureBlock()` in `app/lib/utils.ts` already renders HTML signatures with DOMPurify sanitization. This phase adds the settings UI and a backend image upload endpoint for signature logos/avatars stored in R2.

## Requirements

- Functional: Rich text editor (TipTap — already used in ComposePanel) for editing signature HTML
- Functional: Image upload (logo, avatar) stored in R2 at `signatures/{mailboxId}/{filename}`
- Functional: Enable/disable toggle for signature
- Functional: Live preview of how the signature will appear in composed emails
- Functional: Save persists `signature.html` and `signature.text` (plain text fallback) to R2
- Non-functional: Reuse existing `RichTextEditor` component, extend with TipTap Image extension
- Non-functional: Image upload max 500KB, image types only (png, jpg, gif, svg, webp)

## Architecture

```
settings.tsx
  ├── Account section (existing)
  ├── Notifications section (Phase 2)
  ├── Signature section (NEW)
  │     ├── Enable toggle
  │     ├── RichTextEditor + image upload button
  │     └── Preview (rendered via getSignatureBlock)
  ├── AI Agent Prompt section (existing)
  └── Save button

Image upload flow:
  File picker → POST /api/v1/mailboxes/:id/signature-image
    → Validate type + size
    → Store in R2: signatures/{mailboxId}/{uuid}-{filename}
    → Return URL: /api/v1/mailboxes/:id/signature-image/{filename}
    → Insert <img src="..."> into TipTap editor
```

Existing data flow (no changes to compose):
```
Settings Save → PUT /mailboxes/:id { settings: { signature: { enabled, text, html } } }
                                          ↓
Compose opens → useComposeForm() → getSignatureBlock(settings) → inject into body
```

## Related Code Files

- Modify: `app/routes/settings.tsx` — add Signature section with toggle + RichTextEditor + image upload + preview
- Modify: `app/components/RichTextEditor.tsx` — add optional TipTap Image extension support (controlled via prop)
- Modify: `workers/index.ts` — add `POST /signature-image` upload endpoint + `GET /signature-image/:filename` serve endpoint
- Read: `app/lib/utils.ts` — `getSignatureBlock()` already handles HTML signatures
- Read: `app/hooks/useComposeForm.ts` — already uses `sigBlock` from `getSignatureBlock()`

## Implementation Steps

1. **Add signature image endpoints in `workers/index.ts`:**
   ```ts
   // Upload signature image
   app.post("/api/v1/mailboxes/:mailboxId/signature-image", async (c: AppContext) => {
     const mailboxId = c.req.param("mailboxId")!;
     const formData = await c.req.formData();
     const file = formData.get("file") as File;
     if (!file) return c.json({ error: "No file provided" }, 400);
     
     const allowedTypes = ["image/png", "image/jpeg", "image/gif", "image/svg+xml", "image/webp"];
     if (!allowedTypes.includes(file.type)) return c.json({ error: "Invalid file type" }, 400);
     if (file.size > 500 * 1024) return c.json({ error: "File too large (max 500KB)" }, 400);
     
     const filename = `${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
     await c.env.BUCKET.put(`signatures/${mailboxId}/${filename}`, file.stream());
     
     const url = `/api/v1/mailboxes/${mailboxId}/signature-image/${filename}`;
     return c.json({ url, filename });
   });
   
   // Serve signature image
   app.get("/api/v1/mailboxes/:mailboxId/signature-image/:filename", async (c) => {
     const mailboxId = c.req.param("mailboxId")!;
     const filename = c.req.param("filename")!;
     const obj = await c.env.BUCKET.get(`signatures/${mailboxId}/${filename}`);
     if (!obj) return c.json({ error: "Not found" }, 404);
     return new Response(obj.body, {
       headers: { "Content-Type": obj.httpMetadata?.contentType || "image/png", "Cache-Control": "public, max-age=31536000" },
     });
   });
   ```

2. **Extend `RichTextEditor` with optional Image extension:**
   - Add prop `enableImages?: boolean` (default false — compose doesn't need it)
   - When `enableImages` is true, include TipTap `@tiptap/extension-image` in the editor extensions
   - Add an image upload button to the toolbar (only when `enableImages` is true)
   - Button opens file picker, uploads to signature-image endpoint, inserts `<img>` at cursor
   - Install: `npm install @tiptap/extension-image`

3. **Add signature state to `settings.tsx`:**
   ```ts
   const [signatureEnabled, setSignatureEnabled] = useState(false);
   const [signatureHtml, setSignatureHtml] = useState("");
   ```
   Initialize from `mailbox.settings?.signature` in the existing `useEffect`.

4. **Add Signature section to settings page:**
   - Place between Notifications and AI Agent Prompt sections
   - Enable toggle (checkbox or button that toggles `signatureEnabled`)
   - Conditionally render `<RichTextEditor enableImages value={signatureHtml} onChange={setSignatureHtml} />` when enabled
   - Pass `mailboxId` for image upload URL construction
   - Preview panel below editor showing rendered signature (using `DOMPurify.sanitize`)

5. **Update save handler:**
   Include signature in the settings object:
   ```ts
   const settings = {
     ...mailbox.settings,
     fromName: displayName,
     agentSystemPrompt: agentPrompt.trim() || undefined,
     signature: {
       enabled: signatureEnabled,
       html: signatureHtml,
       text: htmlToPlainText(signatureHtml),
     },
   };
   ```
   Import `htmlToPlainText` from `~/lib/utils`.

6. **Run typecheck + test in browser:**
   - Verify RichTextEditor renders in settings with image button
   - Verify image upload works and image appears in editor
   - Verify signature with images appears in compose when enabled
   - Verify signature does not appear when disabled

## Success Criteria

- [ ] Signature section visible in settings with enable toggle
- [ ] RichTextEditor allows formatting (bold, italic, links, lists) and image insertion
- [ ] Image upload stores file in R2 and inserts `<img>` in editor
- [ ] Image upload validates type (png/jpg/gif/svg/webp) and size (max 500KB)
- [ ] Uploaded images served via GET endpoint with long cache headers
- [ ] Disabling signature hides editor and removes from compose
- [ ] Enabling and saving signature makes it appear in new compose/reply (including images)
- [ ] Plain text fallback auto-generated from HTML (images become alt text or empty)
- [ ] Existing `getSignatureBlock()` renders the saved HTML signature correctly
- [ ] `npm run typecheck` passes

## Risk Assessment

- **RichTextEditor bundle size:** TipTap Image extension adds ~5KB gzipped. Acceptable.
- **XSS via signature HTML:** Mitigated by `DOMPurify.sanitize()` in `getSignatureBlock()`. Images are served from same-origin R2 URLs — no external image risk.
- **R2 storage cleanup:** Signature images are not cleaned up when signature changes. Orphaned images accumulate slowly. Acceptable for personal use — add cleanup later if needed.
- **Image in emails:** Signature images use absolute paths (`/api/v1/...`). When email is sent, recipients see broken images since URL is relative to the app. Mitigation: rewrite relative URLs to absolute (using the app's domain) when sending. This is a known limitation — document for future fix.
