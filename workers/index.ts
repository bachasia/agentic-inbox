// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import PostalMime from "postal-mime";
import { z } from "zod";
import { sendEmail } from "./email-sender";
import { storeAttachments, type StoredAttachment } from "./lib/attachments";
import { notifyNewEmail, testNotification } from "./lib/notifications";
import {
	validateSender,
	SenderValidationError,
	generateMessageId,
	buildThreadingHeaders,
	listMailboxes,
	stripHtmlToText,
} from "./lib/email-helpers";
import { SendEmailRequestSchema } from "./lib/schemas";
import { triageEmail, summarizeThread, extractActionItems, extractContactTopics } from "./lib/ai";
import { embedText, upsertEmailEmbedding, searchSimilarEmails, deleteEmailEmbedding } from "./lib/vectorize";
import { handleReplyEmail, handleForwardEmail } from "./routes/reply-forward";
import { Folders } from "../shared/folders";
import type { Env } from "./types";
import { logger } from "./lib/logger";
import { requireMailbox, type MailboxContext } from "./lib/mailbox";
import { requireAdmin, requireAuth } from "./auth/middleware";
import { getUserMailboxIds } from "./auth/permissions";
import { adminRoutes } from "./routes/admin-routes";

type AppContext = Context<MailboxContext>;

// -- Request body schemas (kept for validation) ---------------------

const CreateMailboxBody = z.object({
	email: z.string().email(),
	name: z.string().min(1),
	settings: z.record(z.any()).optional(), // unvalidated — agentSystemPrompt goes straight to AI
});

const DraftBody = z.object({
	to: z.string().optional(),
	cc: z.string().optional(),
	bcc: z.string().optional(),
	subject: z.string().optional(),
	body: z.string(),
	in_reply_to: z.string().optional(),
	thread_id: z.string().optional(),
	draft_id: z.string().optional(),
});

// -- Helpers --------------------------------------------------------

function slugify(text: string) { // can return "" for non-alphanumeric input
	return text.toString().toLowerCase()
		.replace(/\s+/g, "-").replace(/[^\w-]+/g, "")
		.replace(/--+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
}

function intQuery(c: AppContext, key: string): number | undefined {
	const v = c.req.query(key);
	if (!v) return undefined;
	const n = Number(v);
	return Number.isNaN(n) ? undefined : n;
}

function boolQuery(c: AppContext, key: string): boolean | undefined {
	const v = c.req.query(key);
	if (v === undefined || v === "") return undefined;
	return v === "true" || v === "1";
}

// -- App & middleware -----------------------------------------------

const app = new Hono<MailboxContext>();
app.use("/api/*", cors({
	origin: (origin) => {
		// Same-origin requests have no Origin header — allow them.
		if (!origin) return origin;
		// In development, allow localhost for Vite dev server.
		try {
			const url = new URL(origin);
			if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return origin;
		} catch { /* invalid origin */ }
		// Block all other cross-origin requests. The app is served from the
		// same origin as the API, so legitimate browser requests never send
		// an Origin header. Returning undefined omits Access-Control-Allow-Origin.
		return undefined;
	},
}));
app.use("/api/v1/admin/*", requireAdmin);
app.route("/api/v1/admin", adminRoutes);

app.use("/api/v1/mailboxes/:mailboxId/*", requireMailbox);

// -- Config ---------------------------------------------------------

app.get("/api/v1/config", (c) => {
	const domainsRaw = c.env.DOMAINS || "";
	const domains = domainsRaw.split(",").map((d) => d.trim()).filter(Boolean);
	const emailAddresses = c.env.EMAIL_ADDRESSES ?? [];
	return c.json({ domains, emailAddresses });
});

// -- Mailboxes ------------------------------------------------------

app.get("/api/v1/mailboxes", async (c) => {
	const user = c.get("user");
	const allMailboxes = await listMailboxes(c.env.BUCKET);

	// Members only see their assigned mailboxes
	let visibleMailboxes = allMailboxes;
	if (user && user.role !== "admin") {
		const allowedIds = new Set(await getUserMailboxIds(c.env, user.id));
		visibleMailboxes = allMailboxes.filter((m) => allowedIds.has(m.id));
	}

	const enriched = await Promise.all(
		visibleMailboxes.map(async (m) => {
			const stub = c.env.MAILBOX.get(c.env.MAILBOX.idFromName(m.id));
			const [summary, settingsObj] = await Promise.all([
				(stub as any).getMailboxSummary(),
				c.env.BUCKET.get(`mailboxes/${m.id}.json`),
			]);
			const settings = settingsObj ? await settingsObj.json() as Record<string, any> : null;
			return {
				...m,
				name: settings?.fromName || m.id,
				summary,
				status: {
					forwardingEnabled: !!settings?.forwarding?.enabled,
					autoReplyEnabled: !!settings?.autoReply?.enabled,
				},
			};
		})
	);
	return c.json(enriched);
});

app.post("/api/v1/mailboxes", requireAdmin, async (c) => {
	const { name, settings, email: rawEmail } = CreateMailboxBody.parse(await c.req.json());
	const email = rawEmail.toLowerCase();
	const allowedAddresses = (c.env.EMAIL_ADDRESSES ?? []) as string[];
	if (allowedAddresses.length > 0 && !allowedAddresses.map((a) => a.toLowerCase()).includes(email)) {
		return c.json({ error: "Mailbox creation is restricted to configured EMAIL_ADDRESSES" }, 403);
	}
	const key = `mailboxes/${email}.json`;
	if (await c.env.BUCKET.head(key)) return c.json({ error: "Mailbox already exists" }, 409);
	const defaultSettings = { fromName: name, forwarding: { enabled: false, email: "" }, signature: { enabled: false, text: "" }, autoReply: { enabled: false, subject: "", message: "" }, notifications: { telegram: { enabled: false, botToken: "", chatId: "" }, discord: { enabled: false, webhookUrl: "" } } };
	const finalSettings = { ...defaultSettings, ...settings };
	await c.env.BUCKET.put(key, JSON.stringify(finalSettings));
	const stub = c.env.MAILBOX.get(c.env.MAILBOX.idFromName(email));
	await stub.getFolders();
	return c.json({ id: email, email, name, settings: finalSettings }, 201);
});

app.get("/api/v1/mailboxes/:mailboxId", async (c) => {
	const mailboxId = c.req.param("mailboxId")!;
	const obj = await c.env.BUCKET.get(`mailboxes/${mailboxId}.json`);
	if (!obj) return c.json({ error: "Not found" }, 404);
	return c.json({ id: mailboxId, name: mailboxId, email: mailboxId, settings: await obj.json() });
});

app.put("/api/v1/mailboxes/:mailboxId", async (c) => {
	const mailboxId = c.req.param("mailboxId")!;
	const { settings } = (await c.req.json()) as { settings: Record<string, unknown> };
	const key = `mailboxes/${mailboxId}.json`;
	const existing = await c.env.BUCKET.get(key);
	if (!existing) return c.json({ error: "Not found" }, 404);
	const oldSettings = await existing.json() as Record<string, unknown>;
	await c.env.BUCKET.put(key, JSON.stringify(settings));

	// Seed or cancel daily digest alarm when digestEnabled changes
	const stub = c.env.MAILBOX.get(c.env.MAILBOX.idFromName(mailboxId));
	const wasEnabled = !!(oldSettings as any).digestEnabled;
	const nowEnabled = !!(settings as any).digestEnabled;
	try {
		if (!wasEnabled && nowEnabled) {
			const digestTime = (settings as any).digestTime ?? "08:00";
			await (stub as any).seedDigestAlarm(digestTime, mailboxId);
		} else if (wasEnabled && !nowEnabled) {
			await (stub as any).cancelDigestAlarm();
		}
	} catch (e) {
		logger.error("api", "Digest alarm update failed", { error: e });
	}

	return c.json({ id: mailboxId, name: mailboxId, email: mailboxId, settings });
});

app.delete("/api/v1/mailboxes/:mailboxId", requireAdmin, async (c) => {
	const mailboxId = c.req.param("mailboxId")!;
	const key = `mailboxes/${mailboxId}.json`;
	if (!(await c.env.BUCKET.head(key))) return c.json({ error: "Not found" }, 404);
	await c.env.BUCKET.delete(key); // TODO: also delete DO data and R2 attachment blobs
	return c.body(null, 204);
});

// -- All-mailboxes unified inbox ------------------------------------

const ALLOWED_FOLDERS = new Set(Object.values(Folders));

app.get("/api/v1/emails/all", requireAuth, async (c: AppContext) => {
	const user = c.get("user");
	const rawFolder = c.req.query("folder") ?? "inbox";
	const folder = ALLOWED_FOLDERS.has(rawFolder as any) ? rawFolder : "inbox";
	const rawLimit = parseInt(c.req.query("limit") ?? "25", 10);
	const rawPage = parseInt(c.req.query("page") ?? "1", 10);
	const limit = Math.min(Number.isNaN(rawLimit) ? 25 : rawLimit, 100);
	const page = Number.isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;

	const allMailboxes = await listMailboxes(c.env.BUCKET);
	let visible = allMailboxes;
	if (user.role !== "admin") {
		const allowedIds = new Set(await getUserMailboxIds(c.env, user.id));
		visible = allMailboxes.filter((m) => allowedIds.has(m.id));
	}

	const perMailbox = await Promise.all(
		visible.map(async (m) => {
			const stub = c.env.MAILBOX.get(c.env.MAILBOX.idFromName(m.id));
			const emails = await stub.getEmails({ folder, page: 1, limit: 100 } as any);
			const list: any[] = Array.isArray(emails) ? emails : (emails as any).emails ?? [];
			return list.map((e: any) => ({ ...e, mailboxId: m.id }));
		}),
	);

	const merged = perMailbox
		.flat()
		.sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());

	const offset = (page - 1) * limit;
	return c.json({ emails: merged.slice(offset, offset + limit), total: merged.length });
});

// -- Emails ---------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/emails", async (c: AppContext) => {
	const folder = c.req.query("folder");
	const thread_id = c.req.query("thread_id");
	const threaded = boolQuery(c, "threaded");
	const page = intQuery(c, "page");
	const limit = intQuery(c, "limit");
	const sortColumn = c.req.query("sortColumn") as any;
	const sortDirection = c.req.query("sortDirection") as "ASC" | "DESC" | undefined;
	const label_id = c.req.query("label_id");
	const stub = c.var.mailboxStub;

	if (threaded && folder) {
		const emails = await (stub as any).getThreadedEmails({ folder, page, limit, label_id });
		const totalCount = await (stub as any).countThreadedEmails(folder);
		return c.json({ emails, totalCount });
	}
	const emails = await stub.getEmails({ folder, thread_id, page, limit, sortColumn, sortDirection, label_id } as any);
	if (folder) {
		const totalCount = await stub.countEmails({ folder, thread_id });
		return c.json({ emails, totalCount });
	}
	return c.json(emails);
});

app.post("/api/v1/mailboxes/:mailboxId/emails", async (c: AppContext) => {
	const mailboxId = c.req.param("mailboxId")!;
	const body = SendEmailRequestSchema.parse(await c.req.json());
	const { to, cc, bcc, from, subject, html, text, attachments, in_reply_to, references, thread_id } = body;

	let toStr: string, fromEmail: string, fromDomain: string;
	try {
		({ toStr, fromEmail, fromDomain } = validateSender(to, from, mailboxId));
	} catch (e) {
		if (e instanceof SenderValidationError) return c.json({ error: e.message }, 400);
		throw e;
	}

	const { messageId, outgoingMessageId } = generateMessageId(fromDomain);
	const stub = c.var.mailboxStub;
	const rateLimitError = await (stub as any).checkSendRateLimit();
	if (rateLimitError) return c.json({ error: rateLimitError }, 429);
	const attachmentData = await storeAttachments(c.env.BUCKET, messageId, attachments);

	await stub.createEmail(Folders.SENT, {
		id: messageId, subject, sender: fromEmail, recipient: toStr,
		cc: cc ? (Array.isArray(cc) ? cc.join(", ") : cc).toLowerCase() : null,
		bcc: bcc ? (Array.isArray(bcc) ? bcc.join(", ") : bcc).toLowerCase() : null,
		date: new Date().toISOString(), body: html || text || "",
		in_reply_to: in_reply_to || null, email_references: references ? JSON.stringify(references) : null,
		thread_id: thread_id || in_reply_to || messageId, message_id: outgoingMessageId,
		raw_headers: JSON.stringify([
			{ key: "from", value: typeof from === "string" ? from : `${from.name} <${from.email}>` },
			{ key: "to", value: Array.isArray(to) ? to.join(", ") : to },
			...(cc ? [{ key: "cc", value: Array.isArray(cc) ? cc.join(", ") : cc }] : []),
			...(bcc ? [{ key: "bcc", value: Array.isArray(bcc) ? bcc.join(", ") : bcc }] : []),
			{ key: "subject", value: subject }, { key: "date", value: new Date().toISOString() },
			{ key: "message-id", value: `<${outgoingMessageId}>` },
		]),
	}, attachmentData);

	c.executionCtx.waitUntil(
		sendEmail(c.env.EMAIL, {
			to, cc, bcc, from, subject, html, text,
			attachments: attachments?.map((att) => ({ content: att.content, filename: att.filename, type: att.type, disposition: att.disposition || "attachment", contentId: att.contentId })),
			...(in_reply_to ? { headers: buildThreadingHeaders(in_reply_to, references || []) } : {}),
		}).catch((e) => logger.error("email-send", "Deferred email delivery failed", { error: e })),
	);

	// Schedule unanswered-reply reminder alarm
	c.executionCtx.waitUntil(
		(stub as any).scheduleFollowUpReminder(messageId, mailboxId)
			.catch((e: Error) => logger.error("api", "Follow-up reminder schedule failed", { error: e })),
	);

	// Extract outbound recipients as contacts
	const allRecipientAddrs = [
		...(Array.isArray(to) ? to : [to]),
		...(Array.isArray(cc) ? cc : cc ? [cc] : []),
		...(Array.isArray(bcc) ? bcc : bcc ? [bcc] : []),
	].flat().map((addr) => typeof addr === "string" ? addr : (addr as any).email).filter(Boolean);
	c.executionCtx.waitUntil(
		Promise.all(allRecipientAddrs.map((addr) =>
			(stub as any).upsertContact(addr).catch(() => {}),
		)),
	);

	return c.json({ id: messageId, status: "sent" }, 202);
});

app.post("/api/v1/mailboxes/:mailboxId/drafts", async (c: AppContext) => {
	const mailboxId = c.req.param("mailboxId")!;
	const { to, cc, bcc, subject, body, in_reply_to, thread_id, draft_id } = DraftBody.parse(await c.req.json());
	const stub = c.var.mailboxStub;
	if (draft_id) await stub.deleteEmail(draft_id); // not atomic — create-then-delete would be safer
	const messageId = crypto.randomUUID();
	const now = new Date().toISOString();
	await stub.createEmail(Folders.DRAFT, {
		id: messageId, subject: subject || "", sender: mailboxId.toLowerCase(),
		recipient: (to || "").toLowerCase(), cc: cc?.toLowerCase() || null, bcc: bcc?.toLowerCase() || null,
		date: now, body, in_reply_to: in_reply_to || null, email_references: null,
		thread_id: thread_id || in_reply_to || messageId,
	}, []);
	return c.json({ id: messageId, status: "draft", subject: subject || "", recipient: to || "", date: now }, 201);
});

app.get("/api/v1/mailboxes/:mailboxId/emails/:id", async (c: AppContext) => {
	const email = await c.var.mailboxStub.getEmail(c.req.param("id")!);
	if (!email) return c.json({ error: "Email not found" }, 404);
	return new Response(JSON.stringify(email), {
		headers: { "Content-Type": "application/json" },
	});
});

app.put("/api/v1/mailboxes/:mailboxId/emails/:id", async (c: AppContext) => {
	const { read, starred } = (await c.req.json()) as { read?: boolean; starred?: boolean };
	const email = await c.var.mailboxStub.updateEmail(c.req.param("id")!, { read, starred });
	return email ? c.json(email) : c.json({ error: "Email not found" }, 404);
});

app.delete("/api/v1/mailboxes/:mailboxId/emails/:id", async (c: AppContext) => {
	const id = c.req.param("id")!;
	const mailboxId = c.req.param("mailboxId")!;
	const attachments = await c.var.mailboxStub.deleteEmail(id);
	if (attachments === null) return c.json({ error: "Not found" }, 404);
	if (attachments.length > 0) await c.env.BUCKET.delete(attachments.map((att: any) => `attachments/${id}/${att.id}/${att.filename}`));
	// Clean up Vectorize embedding (fail-open)
	if ((c.env as any).VECTORIZE) {
		c.executionCtx.waitUntil(
			deleteEmailEmbedding((c.env as any).VECTORIZE, mailboxId, id)
				.catch((e: Error) => logger.error("vectorize", "Embedding delete failed", { error: e })),
		);
	}
	return c.body(null, 204);
});

app.post("/api/v1/mailboxes/:mailboxId/emails/:id/move", async (c: AppContext) => {
	const { folderId } = (await c.req.json()) as { folderId: string };
	const success = await c.var.mailboxStub.moveEmail(c.req.param("id")!, folderId);
	return success ? c.json({ status: "moved" }) : c.json({ error: "Folder not found" }, 400);
});

// -- Threads --------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/threads/:threadId", async (c: AppContext) => {
	return c.json(await (c.var.mailboxStub as any).getThreadEmails(c.req.param("threadId")!));
});

app.post("/api/v1/mailboxes/:mailboxId/threads/:threadId/read", async (c: AppContext) => {
	await c.var.mailboxStub.markThreadRead(c.req.param("threadId")!);
	return c.json({ status: "marked_read" });
});

// -- Reply / Forward ------------------------------------------------

app.post("/api/v1/mailboxes/:mailboxId/emails/:id/reply", handleReplyEmail);
app.post("/api/v1/mailboxes/:mailboxId/emails/:id/forward", handleForwardEmail);

// -- Folders --------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/folders", async (c: AppContext) => c.json(await c.var.mailboxStub.getFolders()));

app.post("/api/v1/mailboxes/:mailboxId/folders", async (c: AppContext) => {
	const { name } = (await c.req.json()) as { name: string };
	const slug = slugify(name);
	if (!slug) return c.json({ error: "Folder name must contain alphanumeric characters" }, 400);
	const f = await c.var.mailboxStub.createFolder(slug, name);
	return f ? c.json(f, 201) : c.json({ error: "Folder with this name already exists" }, 409);
});

app.put("/api/v1/mailboxes/:mailboxId/folders/:id", async (c: AppContext) => {
	const { name } = (await c.req.json()) as { name: string };
	const f = await c.var.mailboxStub.updateFolder(c.req.param("id")!, name);
	return f ? c.json(f) : c.json({ error: "Folder not found" }, 404);
});

app.delete("/api/v1/mailboxes/:mailboxId/folders/:id", async (c: AppContext) => {
	const ok = await c.var.mailboxStub.deleteFolder(c.req.param("id")!);
	return ok ? c.body(null, 204) : c.json({ error: "Folder not found or cannot be deleted" }, 400);
});

// -- Search ---------------------------------------------------------

// -- Labels ---------------------------------------------------------

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

// -- Triage override & priority inbox --------------------------------

app.put("/api/v1/mailboxes/:mailboxId/emails/:id/triage", async (c: AppContext) => {
	const { category, priority } = await c.req.json() as { category?: string; priority?: number };
	if (!category && priority == null) return c.json({ error: "category or priority required" }, 400);
	await (c.var.mailboxStub as any).setEmailTriage(c.req.param("id")!, {
		category: category ?? "other",
		priority: priority ?? 2,
		confidence: 1.0,
		reason: "Manual override",
	});
	return c.json({ status: "updated" });
});

app.get("/api/v1/mailboxes/:mailboxId/priority-inbox", async (c: AppContext) => {
	const stub = c.var.mailboxStub as any;
	const emails = await stub.getPriorityInboxEmails(intQuery(c, "page"), intQuery(c, "limit") ?? 50);
	const totalCount = await stub.countPriorityInboxEmails();
	return c.json({ emails, totalCount });
});

// -- Snooze & scheduled send ----------------------------------------

app.post("/api/v1/mailboxes/:mailboxId/emails/:id/snooze", async (c: AppContext) => {
	const { until } = await c.req.json() as { until: string };
	if (!until) return c.json({ error: "until required" }, 400);
	await (c.var.mailboxStub as any).snoozeEmail(c.req.param("id")!, until);
	return c.json({ status: "snoozed", until });
});

app.delete("/api/v1/mailboxes/:mailboxId/emails/:id/snooze", async (c: AppContext) => {
	await (c.var.mailboxStub as any).unsnoozeEmail(c.req.param("id")!);
	return c.body(null, 204);
});

app.post("/api/v1/mailboxes/:mailboxId/emails/:id/schedule", async (c: AppContext) => {
	const mailboxId = c.req.param("mailboxId")!;
	const { sendAt } = await c.req.json() as { sendAt: string };
	await (c.var.mailboxStub as any).scheduleEmail(c.req.param("id")!, sendAt, mailboxId);
	return c.json({ status: "scheduled", sendAt });
});

app.delete("/api/v1/mailboxes/:mailboxId/emails/:id/schedule", async (c: AppContext) => {
	await (c.var.mailboxStub as any).cancelScheduledEmail(c.req.param("id")!);
	return c.body(null, 204);
});

app.get("/api/v1/mailboxes/:mailboxId/snoozed", async (c: AppContext) => {
	const stub = c.var.mailboxStub as any;
	const emails = await stub.getSnoozedEmails(intQuery(c, "page"), intQuery(c, "limit"));
	return c.json({ emails, totalCount: emails.length });
});

app.get("/api/v1/mailboxes/:mailboxId/scheduled", async (c: AppContext) => {
	const stub = c.var.mailboxStub as any;
	const emails = await stub.getScheduledEmails(intQuery(c, "page"), intQuery(c, "limit"));
	return c.json({ emails, totalCount: emails.length });
});

// -- Contacts -------------------------------------------------------

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

// -- Templates (R2-based) ------------------------------------------

interface EmailTemplate { id: string; name: string; subject: string; body: string; }

async function getMailboxTemplates(bucket: R2Bucket, mailboxId: string): Promise<EmailTemplate[] | null> {
	const obj = await bucket.get(`mailboxes/${mailboxId}.json`);
	if (!obj) return null;
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
	const mailboxId = c.req.param("mailboxId")!;
	const { name, subject, body } = await c.req.json() as { name: string; subject: string; body: string };
	const templates = await getMailboxTemplates(c.env.BUCKET, mailboxId);
	if (templates === null) return c.json({ error: "Mailbox not found" }, 404);
	if (templates.length >= 50) return c.json({ error: "Max 50 templates" }, 409);
	const template: EmailTemplate = { id: crypto.randomUUID(), name, subject, body };
	await saveTemplates(c.env.BUCKET, mailboxId, [...templates, template]);
	return c.json(template, 201);
});

app.put("/api/v1/mailboxes/:mailboxId/templates/:id", async (c) => {
	const mailboxId = c.req.param("mailboxId")!;
	const id = c.req.param("id")!;
	const { name, subject, body } = await c.req.json() as { name: string; subject: string; body: string };
	const templates = await getMailboxTemplates(c.env.BUCKET, mailboxId);
	if (templates === null) return c.json({ error: "Mailbox not found" }, 404);
	const idx = templates.findIndex((t) => t.id === id);
	if (idx === -1) return c.json({ error: "Not found" }, 404);
	templates[idx] = { id, name, subject, body };
	await saveTemplates(c.env.BUCKET, mailboxId, templates);
	return c.json(templates[idx]);
});

app.delete("/api/v1/mailboxes/:mailboxId/templates/:id", async (c) => {
	const mailboxId = c.req.param("mailboxId")!;
	const id = c.req.param("id")!;
	const templates = await getMailboxTemplates(c.env.BUCKET, mailboxId);
	if (templates === null) return c.json({ error: "Mailbox not found" }, 404);
	const filtered = templates.filter((t) => t.id !== id);
	if (filtered.length === templates.length) return c.json({ error: "Not found" }, 404);
	await saveTemplates(c.env.BUCKET, mailboxId, filtered);
	return c.body(null, 204);
});

// -- Search ---------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/search", async (c: AppContext) => {
	const searchOpts: Record<string, unknown> = {
		query: c.req.query("query") || "", folder: c.req.query("folder"), from: c.req.query("from"),
		to: c.req.query("to"), subject: c.req.query("subject"), date_start: c.req.query("date_start"),
		date_end: c.req.query("date_end"), is_read: boolQuery(c, "is_read"),
		is_starred: boolQuery(c, "is_starred"), has_attachment: boolQuery(c, "has_attachment"),
	};
	const stub = c.var.mailboxStub as any;
	const emails = await stub.searchEmails({ ...searchOpts, page: intQuery(c, "page"), limit: intQuery(c, "limit") });
	const totalCount = await stub.countSearchResults(searchOpts);
	return c.json({ emails, totalCount });
});

// -- Semantic search ------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/semantic-search", async (c: AppContext) => {
	const query = c.req.query("q") || "";
	const limit = Math.min(intQuery(c, "limit") ?? 20, 50);
	const mailboxId = c.req.param("mailboxId")!;

	if (!query.trim()) return c.json({ emails: [], scores: [] });
	if (!(c.env as any).VECTORIZE) return c.json({ error: "Semantic search not configured" }, 503);

	const matches = await searchSimilarEmails((c.env as any).VECTORIZE, c.env.AI, query, mailboxId, limit * 2);
	if (matches.length === 0) return c.json({ emails: [], scores: [] });

	const emailIds = matches.map((m) => m.emailId);
	const stub = c.var.mailboxStub as any;
	const emails = await stub.getEmailsByIds(emailIds);

	// Re-rank: vectorScore * 0.7 + recencyScore * 0.2 + priorityScore * 0.1
	const now = Date.now();
	const scoreMap = new Map(matches.map((m) => [m.emailId, m.score]));
	const ranked = emails.map((e: any) => {
		const vectorScore = scoreMap.get(e.id) ?? 0;
		const ageMs = e.date ? now - new Date(e.date).getTime() : now;
		const ageDays = ageMs / 86400000;
		const recencyScore = Math.max(0, 1 - ageDays / 365);
		const priorityScore = (e.triage_priority ?? 1) / 4;
		const finalScore = vectorScore * 0.7 + recencyScore * 0.2 + priorityScore * 0.1;
		// Exclude body from response — only metadata needed by the UI
		return { id: e.id, subject: e.subject, sender: e.sender, date: e.date, relevanceScore: finalScore };
	}).sort((a: any, b: any) => b.relevanceScore - a.relevanceScore).slice(0, limit);

	return c.json({ emails: ranked });
});

// -- Contact intelligence -------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/contacts/:contactEmail/intelligence", async (c: AppContext) => {
	const contactEmail = decodeURIComponent(c.req.param("contactEmail")!);
	const stub = c.var.mailboxStub as any;
	const intel = await stub.getContactIntelligence(contactEmail) as Record<string, unknown> | null;
	if (!intel) return c.json({ error: "Contact not found" }, 404);

	// Run AI topic extraction on the raw subjects and replace before returning
	const rawSubjects = (intel.topTopics as string[] | undefined) ?? [];
	if (rawSubjects.length > 0 && !(intel.topicsExtracted as boolean)) {
		const topics = await extractContactTopics(c.env.AI, rawSubjects);
		intel.topTopics = topics;
		intel.topicsExtracted = true;
		// Persist updated intelligence with extracted topics
		await stub.updateContactIntelligenceTopics(contactEmail, topics);
	}

	return c.json(intel);
});

// -- Automation rules -----------------------------------------------

const VALID_RULE_FIELDS = new Set(["from", "to", "subject", "body", "category", "priority"]);
const VALID_RULE_OPERATORS = new Set(["contains", "equals", "starts_with", "ends_with", "greater_than", "less_than"]);
const VALID_ACTION_TYPES = new Set(["label", "move", "archive", "mark_read", "notify", "webhook"]);

function validateRuleConditions(conditions: unknown): string | null {
	if (!Array.isArray(conditions) || conditions.length === 0) return "conditions must be a non-empty array";
	for (const c of conditions) {
		if (!VALID_RULE_FIELDS.has((c as any)?.field)) return `invalid condition field: ${(c as any)?.field}`;
		if (!VALID_RULE_OPERATORS.has((c as any)?.operator)) return `invalid condition operator: ${(c as any)?.operator}`;
		if (typeof (c as any)?.value !== "string") return "condition value must be a string";
	}
	return null;
}

function validateRuleActions(actions: unknown): string | null {
	if (!Array.isArray(actions) || actions.length === 0) return "actions must be a non-empty array";
	for (const a of actions) {
		if (!VALID_ACTION_TYPES.has((a as any)?.type)) return `invalid action type: ${(a as any)?.type}`;
	}
	return null;
}

app.get("/api/v1/mailboxes/:mailboxId/rules", async (c: AppContext) => {
	const rules = await (c.var.mailboxStub as any).listRules();
	return c.json(rules);
});

app.post("/api/v1/mailboxes/:mailboxId/rules", async (c: AppContext) => {
	const body = await c.req.json() as { name: string; conditions: unknown; actions: unknown; priority?: number };
	if (!body.name?.trim()) return c.json({ error: "name is required" }, 400);
	const condErr = validateRuleConditions(body.conditions);
	if (condErr) return c.json({ error: condErr }, 400);
	const actErr = validateRuleActions(body.actions);
	if (actErr) return c.json({ error: actErr }, 400);
	const allRules = await (c.var.mailboxStub as any).listRules();
	if (allRules.length >= 50) return c.json({ error: "Maximum 50 rules per mailbox" }, 422);
	const id = await (c.var.mailboxStub as any).createRule(body);
	return c.json({ id }, 201);
});

// Static route registered before parameterized /:ruleId to avoid ambiguity
app.put("/api/v1/mailboxes/:mailboxId/rules/reorder", async (c: AppContext) => {
	const { ids } = await c.req.json() as { ids: string[] };
	if (!Array.isArray(ids)) return c.json({ error: "ids must be an array" }, 400);
	if (ids.length > 50) return c.json({ error: "Too many IDs" }, 400);
	await (c.var.mailboxStub as any).reorderRules(ids);
	return c.json({ reordered: true });
});

app.put("/api/v1/mailboxes/:mailboxId/rules/:ruleId", async (c: AppContext) => {
	const ruleId = c.req.param("ruleId")!;
	const updates = await c.req.json() as Record<string, unknown>;
	if (updates.conditions !== undefined) {
		const err = validateRuleConditions(updates.conditions);
		if (err) return c.json({ error: err }, 400);
	}
	if (updates.actions !== undefined) {
		const err = validateRuleActions(updates.actions);
		if (err) return c.json({ error: err }, 400);
	}
	const ok = await (c.var.mailboxStub as any).updateRule(ruleId, updates);
	return ok ? c.json({ id: ruleId, updated: true }) : c.json({ error: "Not found" }, 404);
});

app.delete("/api/v1/mailboxes/:mailboxId/rules/:ruleId", async (c: AppContext) => {
	const ruleId = c.req.param("ruleId")!;
	const ok = await (c.var.mailboxStub as any).deleteRule(ruleId);
	return ok ? c.body(null, 204) : c.json({ error: "Not found" }, 404);
});

// -- WooCommerce ----------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/woocommerce/orders", async (c: AppContext) => {
	const email = c.req.query("email");
	if (!email) return c.json({ error: "email query param required" }, 400);
	const orders = await (c.var.mailboxStub as any).getWooOrders(email.toLowerCase());
	return c.json({ orders });
});

app.post("/api/v1/mailboxes/:mailboxId/woocommerce/test", async (c: AppContext) => {
	const body = await c.req.json() as { storeUrl?: string; consumerKey?: string; consumerSecret?: string };
	if (!body.storeUrl || !body.consumerKey || !body.consumerSecret) {
		return c.json({ success: false, error: "storeUrl, consumerKey, consumerSecret required" }, 400);
	}
	const { testWooCommerceConnection } = await import("./lib/woocommerce");
	const result = await testWooCommerceConnection({
		storeUrl: body.storeUrl,
		consumerKey: body.consumerKey,
		consumerSecret: body.consumerSecret,
	});
	return c.json(result);
});

// -- Attachments ----------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/emails/:emailId/attachments/:attachmentId", async (c: AppContext) => {
	const emailId = c.req.param("emailId")!;
	const attachmentId = c.req.param("attachmentId")!;
	const attachment = await c.var.mailboxStub.getAttachment(attachmentId);
	if (!attachment) return c.json({ error: "Attachment not found" }, 404);
	const obj = await c.env.BUCKET.get(`attachments/${emailId}/${attachmentId}/${attachment.filename}`);
	if (!obj) return c.json({ error: "Attachment file not found" }, 404);
	const headers = new Headers();
	headers.set("Content-Type", attachment.mimetype);
	const sanitized = attachment.filename.replace(/[\x00-\x1f"\\]/g, "_");
	headers.set("Content-Disposition", `attachment; filename="${sanitized}"; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`);
	return new Response(obj.body, { headers });
});

// -- Action items ---------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/action-items", async (c: AppContext) => {
	const pendingOnly = boolQuery(c, "pending") ?? false;
	const items = await (c.var.mailboxStub as any).listActionItems({ pendingOnly });
	return c.json(items);
});

app.patch("/api/v1/mailboxes/:mailboxId/action-items/:itemId", async (c: AppContext) => {
	const itemId = c.req.param("itemId")!;
	const { completed } = await c.req.json() as { completed?: boolean };
	if (completed) {
		await (c.var.mailboxStub as any).completeActionItem(itemId);
	}
	return c.json({ id: itemId, updated: true });
});

app.delete("/api/v1/mailboxes/:mailboxId/action-items/:itemId", async (c: AppContext) => {
	const itemId = c.req.param("itemId")!;
	await (c.var.mailboxStub as any).deleteActionItem(itemId);
	return c.body(null, 204);
});

// -- Follow-up reminder cancel -------------------------------------

app.delete("/api/v1/mailboxes/:mailboxId/emails/:emailId/follow-up-reminder", async (c: AppContext) => {
	const emailId = c.req.param("emailId")!;
	await (c.var.mailboxStub as any).cancelFollowUpReminder(emailId);
	return c.body(null, 204);
});

// -- Notification test ----------------------------------------------

app.post("/api/v1/mailboxes/:mailboxId/test-notification", async (c: AppContext) => {
	const { provider, settings } = await c.req.json() as {
		provider: "telegram" | "discord";
		settings: Record<string, string>;
	};
	const result = await testNotification(provider, settings);
	return c.json(result);
});

// -- Signature images -----------------------------------------------

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/svg+xml", "image/webp"];
const MAX_SIGNATURE_IMAGE_SIZE = 500 * 1024;

app.post("/api/v1/mailboxes/:mailboxId/signature-image", async (c: AppContext) => {
	const mailboxId = c.req.param("mailboxId")!;
	const formData = await c.req.formData();
	const file = formData.get("file") as File | null;
	if (!file) return c.json({ error: "No file provided" }, 400);
	if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return c.json({ error: "Invalid file type" }, 400);
	if (file.size > MAX_SIGNATURE_IMAGE_SIZE) return c.json({ error: "File too large (max 500KB)" }, 400);
	const filename = `${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
	await c.env.BUCKET.put(`signatures/${mailboxId}/${filename}`, file.stream(), {
		httpMetadata: { contentType: file.type },
	});
	const url = `/api/v1/mailboxes/${mailboxId}/signature-image/${filename}`;
	return c.json({ url, filename });
});

app.get("/api/v1/mailboxes/:mailboxId/signature-image/:filename", async (c) => {
	const mailboxId = c.req.param("mailboxId")!;
	const filename = c.req.param("filename")!;
	const obj = await c.env.BUCKET.get(`signatures/${mailboxId}/${filename}`);
	if (!obj) return c.json({ error: "Not found" }, 404);
	return new Response(obj.body, {
		headers: {
			"Content-Type": obj.httpMetadata?.contentType || "image/png",
			"Cache-Control": "public, max-age=31536000",
		},
	});
});

// -- Export --------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/export", async (c: AppContext) => {
	const { exportMailboxToZip } = await import("./lib/email-export");
	const mailboxId = c.req.param("mailboxId")!;
	const folder = c.req.query("folder");
	const zipData = await exportMailboxToZip(c.var.mailboxStub, c.env.BUCKET, { folder });
	const date = new Date().toISOString().slice(0, 10);
	return new Response(zipData.buffer as ArrayBuffer, {
		headers: {
			"Content-Type": "application/zip",
			"Content-Disposition": `attachment; filename="mailbox-export-${mailboxId}-${date}.zip"`,
		},
	});
});

// -- Receive inbound email ------------------------------------------

const MAX_EMAIL_SIZE = 25 * 1024 * 1024;

async function streamToArrayBuffer(stream: ReadableStream, streamSize: number) {
	if (streamSize > MAX_EMAIL_SIZE) throw new Error(`Email too large: ${streamSize} bytes exceeds ${MAX_EMAIL_SIZE} byte limit`);
	if (streamSize <= 0) throw new Error(`Invalid stream size: ${streamSize}`);
	const result = new Uint8Array(streamSize);
	let bytesRead = 0;
	const reader = stream.getReader();
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (bytesRead + value.length > streamSize) { reader.cancel(); throw new Error(`Stream exceeds declared size`); }
		result.set(value, bytesRead);
		bytesRead += value.length;
	}
	return result;
}

async function receiveEmail(event: { raw: ReadableStream; rawSize: number }, env: Env, ctx: ExecutionContext) {
	const rawEmail = await streamToArrayBuffer(event.raw, event.rawSize);
	const parsedEmail = await new PostalMime().parse(rawEmail);

	if (!parsedEmail.to?.length || !parsedEmail.to[0].address) throw new Error("received email with empty to");

	const allowedAddresses = ((env.EMAIL_ADDRESSES ?? []) as string[]).map((a) => a.toLowerCase());
	const allRecipients = parsedEmail.to.map((t) => t.address?.toLowerCase()).filter(Boolean) as string[];
	const ccRecipients = (parsedEmail.cc || []).map((e) => e.address?.toLowerCase()).filter(Boolean) as string[];
	const bccRecipients = (parsedEmail.bcc || []).map((e) => e.address?.toLowerCase()).filter(Boolean) as string[];

	let mailboxId: string | undefined;
	if (allowedAddresses.length > 0) {
		mailboxId = allRecipients.find((addr) => allowedAddresses.includes(addr));
		if (!mailboxId) { console.log(`Ignoring email: no recipient matches EMAIL_ADDRESSES.`); return; }
	} else { mailboxId = allRecipients[0]; }
	if (!mailboxId) throw new Error("received email with no valid recipient address");

	const messageId = crypto.randomUUID();
	const settingsObj = await env.BUCKET.get(`mailboxes/${mailboxId}.json`);
	if (!settingsObj) { console.log(`Ignoring email for ${mailboxId}: mailbox does not exist`); return; }
	const mailboxSettings = await settingsObj.json() as Record<string, any>;

	const stub = env.MAILBOX.get(env.MAILBOX.idFromName(mailboxId));

	const attachmentData: StoredAttachment[] = [];
	if (parsedEmail.attachments) {
		for (const att of parsedEmail.attachments) {
			const attId = crypto.randomUUID();
			const filename = (att.filename || "untitled").replace(/[\/\\:*?"<>|\x00-\x1f]/g, "_");
			await env.BUCKET.put(`attachments/${messageId}/${attId}/${filename}`, att.content);
			attachmentData.push({ id: attId, email_id: messageId, filename, mimetype: att.mimeType,
				size: typeof att.content === "string" ? att.content.length : att.content.byteLength,
				content_id: att.contentId || null, disposition: att.disposition || "attachment" });
		}
	}

	const extractMsgId = (s: string) => { const m = s.match(/<([^>]+)>/); return m ? m[1] : s.trim().split(/\s+/)[0]; };
	const inReplyTo = parsedEmail.inReplyTo ? extractMsgId(parsedEmail.inReplyTo) : null;
	const emailReferences = parsedEmail.references ? parsedEmail.references.split(/\s+/).filter(Boolean).map(extractMsgId) : [];
	let threadId = emailReferences[0] || inReplyTo || messageId;

	if (!inReplyTo && emailReferences.length === 0) {
		const subjectThread = await (stub as any).findThreadBySubject(parsedEmail.subject || "", parsedEmail.from?.address || undefined);
		if (subjectThread) threadId = subjectThread;
	}

	const originalMessageId = parsedEmail.messageId ? extractMsgId(parsedEmail.messageId) : null;

	await stub.createEmail(Folders.INBOX, {
		id: messageId, subject: parsedEmail.subject || "",
		sender: (parsedEmail.from?.address || "").toLowerCase(), recipient: allRecipients.join(", "),
		cc: ccRecipients.join(", ") || null, bcc: bccRecipients.join(", ") || null,
		date: new Date().toISOString(), // uses receive time, not the email's Date header
		body: parsedEmail.html || parsedEmail.text || "",
		in_reply_to: inReplyTo, email_references: emailReferences.length > 0 ? JSON.stringify(emailReferences) : null,
		thread_id: threadId, message_id: originalMessageId, raw_headers: JSON.stringify(parsedEmail.headers),
	}, attachmentData);

	// Extract sender as contact (skip automated senders)
	const NOREPLY_PATTERNS = /noreply|no-reply|donotreply|mailer-daemon|bounce|notifications?@|alerts?@/i;
	const senderAddr = (parsedEmail.from?.address || "").toLowerCase();
	if (senderAddr && !NOREPLY_PATTERNS.test(senderAddr)) {
		ctx.waitUntil(
			(stub as any).upsertContact(senderAddr, parsedEmail.from?.name || undefined)
				.catch((e: Error) => logger.error("contacts", "Contact upsert failed", { error: e })),
		);
	}

	// Triage + thread summarization (fail-open: email still arrives if this fails)
	ctx.waitUntil((async () => {
		try {
			const triage = await triageEmail(env.AI, {
				subject: parsedEmail.subject || "",
				body: parsedEmail.html || parsedEmail.text || "",
				sender: senderAddr,
			});
			if (!triage) return;

			await (stub as any).setEmailTriage(messageId, triage);

			const labelId = await (stub as any).ensureSystemLabel(triage.category);
			if (labelId) {
				await (stub as any).applyLabel(messageId, labelId);
			}

			if (triage.category === "spam" && triage.confidence > 0.85) {
				await stub.moveEmail(messageId, "spam");
			}

			// Thread summarization for threads with 3+ messages
			if (threadId && threadId !== messageId) {
				const threadCount = await (stub as any).countThreadEmails(threadId);
				if (threadCount >= 3) {
					const threadEmails = await (stub as any).getThreadEmails(threadId);
					if (Array.isArray(threadEmails) && threadEmails.length >= 3) {
						const summary = await summarizeThread(env.AI, threadEmails);
						if (summary) await (stub as any).setThreadSummary(messageId, summary);
					}
				}
			}
		} catch (e) {
			logger.error("triage", "Triage failed", { error: e });
		}
	})());

	ctx.waitUntil(
		notifyNewEmail(mailboxSettings.notifications, {
			sender: (parsedEmail.from?.address || "").toLowerCase(),
			senderName: parsedEmail.from?.name || undefined,
			subject: parsedEmail.subject || "(no subject)",
			mailboxId,
		}).catch((e: Error) => logger.error("notifications", "Notification failed", { error: e })),
	);

	// Extract action items (fail-open: skip newsletters/notifications/spam)
	ctx.waitUntil((async () => {
		try {
			const triage = await (stub as any).getEmailTriage(messageId);
			const skipCategories = new Set(["newsletter", "notification", "spam"]);
			if (triage?.triage_category && skipCategories.has(triage.triage_category)) return;
			const items = await extractActionItems(env.AI, {
				subject: parsedEmail.subject || "",
				body: parsedEmail.html || parsedEmail.text || "",
				sender: (parsedEmail.from?.address || "").toLowerCase(),
			});
			for (const item of items) {
				await (stub as any).createActionItem({ emailId: messageId, description: item.description, dueDate: item.dueDate });
			}
		} catch (e) {
			logger.error("triage", "Action item extraction failed", { error: e });
		}
	})());

	// Embed email for semantic search (fail-open, non-blocking)
	if ((env as any).VECTORIZE) {
		const plainText = parsedEmail.text || stripHtmlToText(parsedEmail.html || "");
		const embedBody = `${parsedEmail.subject || ""} ${plainText}`.trim();
		ctx.waitUntil((async () => {
			try {
				const vector = await embedText(env.AI, embedBody);
				if (vector) {
					await upsertEmailEmbedding((env as any).VECTORIZE, mailboxId, messageId, vector, {
						folder: "inbox",
						date: new Date().toISOString(),
					});
					await (stub as any).markEmbedded(messageId);
				}
			} catch (e) {
				logger.error("vectorize", "Embedding failed", { error: e });
			}
		})());
	}

	// Evaluate automation rules then fire any webhook actions with ctx.waitUntil (fail-open)
	ctx.waitUntil((async () => {
		try {
			const { pendingWebhooks } = await (stub as any).evaluateAndApplyRules(messageId, mailboxId, env) as { pendingWebhooks: Array<{ url: string; payload: Record<string, unknown> }> };
			for (const wh of pendingWebhooks) {
				ctx.waitUntil(
					fetch(wh.url, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(wh.payload),
					}).catch((e: Error) => logger.error("rules", "Rule webhook failed", { error: e })),
				);
			}
		} catch (e) {
			logger.error("rules", "Rule evaluation failed", { error: e });
		}
	})());

	const agentStub = env.EMAIL_AGENT.get(env.EMAIL_AGENT.idFromName(mailboxId));
	ctx.waitUntil(agentStub.fetch(new Request("https://agents/onNewEmail", {
		method: "POST", headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ mailboxId, emailId: messageId, sender: (parsedEmail.from?.address || "").toLowerCase(), subject: parsedEmail.subject || "", threadId }),
	})).catch((e) => logger.error("agent", "Auto-draft trigger failed", { error: e })));
}

export { app, receiveEmail };
