// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { DurableObject } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { eq, and, or, asc, desc, sql, inArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import * as schema from "../db/schema";
import { Folders } from "../../shared/folders";
import type { Env } from "../types";
import { applyMigrations, mailboxMigrations } from "./migrations";
import { sendEmail } from "../email-sender";
import { sendReminderNotification, sendDigestNotification, notifyNewEmail, getEffectiveNotifications } from "../lib/notifications";
import { synthesizeDigest } from "../lib/ai";
import { evaluateAllRules, isValidWebhookUrl } from "../lib/rules-engine";

function nextDigestFireAt(digestTime: string): string {
	const [h, m] = digestTime.split(":").map(Number);
	const now = new Date();
	const next = new Date(now);
	next.setUTCHours(h ?? 8, m ?? 0, 0, 0);
	if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
	return next.toISOString();
}

/**
 * SQL expression to normalize email subjects by stripping common
 * reply/forward prefixes (Re:, Fwd:, FW:, AW:, WG:, Réf:, SV:).
 * Used for conversation grouping. Hardcoded to the `subject` column.
 */
const NORMALIZED_SUBJECT_SQL = `LOWER(TRIM(
	REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
		LOWER(subject),
		'aw: ', ''), 'wg: ', ''), 'réf: ', ''), 'sv: ', ''),
		're: ', ''), 'fwd: ', ''), 'fw: ', '')
))`;

const ALLOWED_SORT_COLUMNS = [
	"id",
	"subject",
	"sender",
	"recipient",
	"date",
	"read",
	"starred",
] as const;

type SortColumn = (typeof ALLOWED_SORT_COLUMNS)[number];

/**
 * Map SortColumn string names to Drizzle column references for safe
 * ORDER BY construction (no string interpolation into SQL).
 */
const SORT_COLUMN_MAP = {
	id: schema.emails.id,
	subject: schema.emails.subject,
	sender: schema.emails.sender,
	recipient: schema.emails.recipient,
	date: schema.emails.date,
	read: schema.emails.read,
	starred: schema.emails.starred,
} satisfies Record<SortColumn, typeof schema.emails[keyof typeof schema.emails]>;

interface SearchFilterOptions {
	query: string;
	folder?: string;
	from?: string;
	to?: string;
	subject?: string;
	date_start?: string;
	date_end?: string;
	is_read?: boolean;
	is_starred?: boolean;
	has_attachment?: boolean;
}

interface GetEmailsOptions {
	folder?: string;
	thread_id?: string;
	page?: number;
	limit?: number;
	sortColumn?: SortColumn;
	sortDirection?: "ASC" | "DESC";
	label_id?: string;
}

interface EmailData {
	id: string;
	subject: string;
	sender: string;
	recipient: string;
	cc?: string | null;
	bcc?: string | null;
	date: string;
	body: string;
	read?: boolean;
	starred?: boolean;
	in_reply_to?: string | null;
	email_references?: string | null;
	thread_id?: string | null;
	message_id?: string | null;
	raw_headers?: string | null;
}

interface AttachmentData {
	id: string;
	email_id: string;
	filename: string;
	mimetype: string;
	size: number;
	content_id?: string | null;
	disposition?: string | null;
}

export class MailboxDO extends DurableObject<Env> {
	declare __DURABLE_OBJECT_BRAND: never;
	db: ReturnType<typeof drizzle>;

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
		this.db = drizzle(this.ctx.storage, { schema });
		applyMigrations(this.ctx.storage.sql, mailboxMigrations, this.ctx.storage);
	}

	// ── Email CRUD (Drizzle) ───────────────────────────────────────

	async getEmails(options: GetEmailsOptions = {}) {
		const {
			folder,
			thread_id,
			page = 1,
			limit: rawLimit = 25,
			sortColumn: rawSortColumn = "date",
			sortDirection = "DESC",
			label_id,
		} = options;

		// Cap pagination limit to prevent unbounded queries
		const limit = Math.min(Math.max(rawLimit, 1), 100);

		const sortColumn: SortColumn = ALLOWED_SORT_COLUMNS.includes(
			rawSortColumn as SortColumn,
		)
			? rawSortColumn
			: "date";

		const offset = (page - 1) * limit;

		const conditions: SQL[] = [];
		if (folder) {
			conditions.push(
				sql`${schema.emails.folder_id} = (SELECT id FROM folders WHERE name = ${folder} OR id = ${folder} LIMIT 1)`,
			);
		}
		if (thread_id) {
			conditions.push(eq(schema.emails.thread_id, thread_id));
		}
		// Exclude snoozed emails from inbox view
		if (folder === Folders.INBOX || folder === "inbox") {
			conditions.push(sql`(${schema.emails.snooze_until} IS NULL OR ${schema.emails.snooze_until} <= datetime('now'))`);
		}
		if (label_id) {
			conditions.push(sql`${schema.emails.id} IN (SELECT email_id FROM email_labels WHERE label_id = ${label_id})`);
		}

		const orderCol = SORT_COLUMN_MAP[sortColumn];
		const orderDir = sortDirection === "ASC" ? asc(orderCol) : desc(orderCol);

		const result = this.db
			.select({
				id: schema.emails.id,
				subject: schema.emails.subject,
				sender: schema.emails.sender,
				recipient: schema.emails.recipient,
				cc: schema.emails.cc,
				bcc: schema.emails.bcc,
				date: schema.emails.date,
				read: schema.emails.read,
				starred: schema.emails.starred,
				in_reply_to: schema.emails.in_reply_to,
				email_references: schema.emails.email_references,
				thread_id: schema.emails.thread_id,
				folder_id: schema.emails.folder_id,
				triage_category: schema.emails.triage_category,
				triage_priority: schema.emails.triage_priority,
				triage_summary: schema.emails.triage_summary,
				triage_confidence: schema.emails.triage_confidence,
				snippet: sql<string>`SUBSTR(${schema.emails.body}, 1, 300)`,
			})
			.from(schema.emails)
			.where(conditions.length > 0 ? and(...conditions) : undefined)
			.orderBy(orderDir)
			.limit(limit)
			.offset(offset)
			.all();

		return result.map((email) => ({
			...email,
			read: !!email.read,
			starred: !!email.starred,
		}));
	}

	/**
	 * Count total emails matching the given filters (for pagination).
	 */
	async countEmails(options: { folder?: string; thread_id?: string } = {}) {
		const { folder, thread_id } = options;
		const conditions: string[] = [];
		const params: (string | number)[] = [];

		if (folder) {
			conditions.push(
				"folder_id = (SELECT id FROM folders WHERE name = ?1 OR id = ?1 LIMIT 1)",
			);
			params.push(folder);
		}

		if (thread_id) {
			conditions.push(`thread_id = ?${params.length + 1}`);
			params.push(thread_id);
		}

		if (folder === Folders.INBOX || folder === "inbox") {
			conditions.push("(snooze_until IS NULL OR snooze_until <= datetime('now'))");
		}

		const where =
			conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
		const row = [
			...this.ctx.storage.sql.exec(
				`SELECT COUNT(*) as total FROM emails ${where}`,
				...params,
			),
		][0] as { total: number } | undefined;

		return row?.total ?? 0;
	}

	// ── Threaded queries (raw SQL — too complex for Drizzle's builder) ──

	async getThreadedEmails(options: GetEmailsOptions = {}) {
		const {
			folder,
			page = 1,
			limit: rawLimit = 25,
			label_id,
		} = options;
		const limit = Math.min(Math.max(rawLimit, 1), 100);

		if (!folder) {
			// Fallback to regular getEmails if no folder specified
			return this.getEmails(options);
		}

		const offset = (page - 1) * limit;

		// Thread grouping strategy:
		// For DRAFT folder: group by in_reply_to (the email being replied to).
		//   This ensures reply-drafts to different emails stay separate, even if
		//   they share a thread_id or subject. New drafts (no in_reply_to) each
		//   get their own group via their unique id.
		// For other folders:
		//   1. Primary: group by thread_id (from email threading headers)
		//   2. Fallback: group by normalized subject (strips Re:/Fwd:/FW: prefixes)
		//      for legacy emails that lack threading headers (thread_id IS NULL).
		const isDraftFolder = folder === Folders.DRAFT;
		const labelCond = label_id ? `AND id IN (SELECT email_id FROM email_labels WHERE label_id = '${label_id.replace(/'/g, "''")}')` : "";

		if (isDraftFolder) {
			const result = this.ctx.storage.sql.exec(
				`WITH
				folder_emails AS (
					SELECT *,
						COALESCE(in_reply_to, id) as draft_group_key
					FROM emails
					WHERE folder_id = (SELECT id FROM folders WHERE name = ?1 OR id = ?1 LIMIT 1)
					${labelCond}
				),
				draft_stats AS (
					SELECT
						draft_group_key,
						COUNT(*) as thread_count,
						SUM(CASE WHEN read = 0 THEN 1 ELSE 0 END) as thread_unread_count,
						GROUP_CONCAT(DISTINCT sender) as participants
					FROM folder_emails
					GROUP BY draft_group_key
				),
				latest_per_group AS (
					SELECT
						fe.*,
						ROW_NUMBER() OVER (
							PARTITION BY fe.draft_group_key
							ORDER BY fe.date DESC
						) as rn
					FROM folder_emails fe
				)
				SELECT
					lp.id, lp.subject, lp.sender, lp.recipient, lp.date,
					lp.read, lp.starred, lp.thread_id, lp.folder_id,
					lp.in_reply_to, lp.email_references,
					lp.triage_category, lp.triage_priority, lp.triage_summary, lp.triage_confidence,
					SUBSTR(lp.body, 1, 300) as snippet,
					ds.thread_count, ds.thread_unread_count, ds.participants
				FROM latest_per_group lp
				JOIN draft_stats ds ON lp.draft_group_key = ds.draft_group_key
				WHERE lp.rn = 1
				ORDER BY lp.date DESC
				LIMIT ?2 OFFSET ?3`,
				folder, limit, offset
			);

			const rows = [...result];
			return rows.map((row: any) => ({
				...row,
				read: !!row.read,
				starred: !!row.starred,
				thread_count: row.thread_count || 1,
				thread_unread_count: row.thread_unread_count || 0,
				participants: row.participants || row.sender,
			}));
		}

		// Non-draft folders: full threading logic
		const snoozeCond = (folder === Folders.INBOX || folder === "inbox")
			? "AND (snooze_until IS NULL OR snooze_until <= datetime('now'))"
			: "";

		const result = this.ctx.storage.sql.exec(
			`WITH
			folder_emails AS (
				SELECT *,
					COALESCE(thread_id, id) as raw_thread_id,
					${NORMALIZED_SUBJECT_SQL} as normalized_subject
				FROM emails
				WHERE folder_id = (SELECT id FROM folders WHERE name = ?1 OR id = ?1 LIMIT 1)
				${snoozeCond}
				${labelCond}
			),
			thread_to_conversation AS (
				SELECT
					raw_thread_id,
					normalized_subject,
					CASE
						WHEN thread_id IS NOT NULL THEN raw_thread_id
						ELSE MIN(raw_thread_id) OVER (PARTITION BY normalized_subject)
					END as conversation_id
				FROM folder_emails
				GROUP BY raw_thread_id, normalized_subject, thread_id
			),
			all_emails_with_conversation AS (
				SELECT
					e.*,
					COALESCE(tc.conversation_id, COALESCE(e.thread_id, e.id)) as conversation_id
				FROM emails e
				LEFT JOIN thread_to_conversation tc
					ON COALESCE(e.thread_id, e.id) = tc.raw_thread_id
			),
			conversation_stats AS (
				SELECT
					conversation_id,
					COUNT(*) as thread_count,
					SUM(CASE WHEN read = 0 THEN 1 ELSE 0 END) as thread_unread_count,
					SUM(CASE WHEN read = 1 THEN 1 ELSE 0 END) as thread_read_count,
					GROUP_CONCAT(DISTINCT sender) as participants,
					SUM(CASE WHEN folder_id = (SELECT id FROM folders WHERE name = 'draft' LIMIT 1) THEN 1 ELSE 0 END) as has_draft
				FROM all_emails_with_conversation
				WHERE conversation_id IN (
					SELECT DISTINCT conversation_id FROM all_emails_with_conversation
					WHERE folder_id = (SELECT id FROM folders WHERE name = ?1 OR id = ?1 LIMIT 1)
				)
				GROUP BY conversation_id
			),
			latest_message_per_conversation AS (
				SELECT
					conversation_id,
					folder_id,
					ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY date DESC) as rn
				FROM all_emails_with_conversation
			),
			latest_in_folder AS (
				SELECT
					fe.*,
					COALESCE(tc.conversation_id, fe.raw_thread_id) as conversation_id,
					ROW_NUMBER() OVER (
						PARTITION BY COALESCE(tc.conversation_id, fe.raw_thread_id)
						ORDER BY fe.date DESC
					) as rn
				FROM folder_emails fe
				LEFT JOIN thread_to_conversation tc
					ON fe.raw_thread_id = tc.raw_thread_id
			)
			SELECT
				lif.id, lif.subject, lif.sender, lif.recipient, lif.date,
				lif.read, lif.starred, lif.thread_id, lif.folder_id,
				lif.in_reply_to, lif.email_references,
				lif.triage_category, lif.triage_priority, lif.triage_summary, lif.triage_confidence,
				SUBSTR(lif.body, 1, 300) as snippet,
				cs.thread_count, cs.thread_unread_count, cs.participants,
				CASE WHEN lmc.folder_id != (SELECT id FROM folders WHERE name = 'sent' LIMIT 1)
					AND lmc.folder_id != (SELECT id FROM folders WHERE name = 'draft' LIMIT 1)
					AND cs.thread_read_count > 0
					THEN 1 ELSE 0 END as needs_reply,
				CASE WHEN cs.has_draft > 0 THEN 1 ELSE 0 END as has_draft
			FROM latest_in_folder lif
			JOIN conversation_stats cs ON lif.conversation_id = cs.conversation_id
			LEFT JOIN latest_message_per_conversation lmc
				ON lmc.conversation_id = lif.conversation_id AND lmc.rn = 1
			WHERE lif.rn = 1
			ORDER BY lif.date DESC
			LIMIT ?2 OFFSET ?3`,
			folder, limit, offset
		);

		const rows = [...result];
		return rows.map((row: any) => ({
			...row,
			read: !!row.read,
			starred: !!row.starred,
			thread_count: row.thread_count || 1,
			thread_unread_count: row.thread_unread_count || 0,
			participants: row.participants || row.sender,
			needs_reply: !!row.needs_reply,
			has_draft: !!row.has_draft,
		}));
	}

	/**
	 * Count threaded conversations in a folder (for pagination).
	 * Returns the number of conversation groups, not individual emails.
	 */
	async countThreadedEmails(folder: string) {
		const isDraftFolder = folder === Folders.DRAFT;

		if (isDraftFolder) {
			const row = [
				...this.ctx.storage.sql.exec(
					`SELECT COUNT(DISTINCT COALESCE(in_reply_to, id)) as total
					 FROM emails
					 WHERE folder_id = (SELECT id FROM folders WHERE name = ?1 OR id = ?1 LIMIT 1)`,
					folder,
				),
			][0] as { total: number } | undefined;
			return row?.total ?? 0;
		}

		const countSnoozeCond = (folder === Folders.INBOX || folder === "inbox")
			? "AND (snooze_until IS NULL OR snooze_until <= datetime('now'))"
			: "";

		const row = [
			...this.ctx.storage.sql.exec(
				`WITH
				folder_emails AS (
					SELECT
						COALESCE(thread_id, id) as raw_thread_id,
						thread_id,
					${NORMALIZED_SUBJECT_SQL} as normalized_subject
					FROM emails
					WHERE folder_id = (SELECT id FROM folders WHERE name = ?1 OR id = ?1 LIMIT 1)
					${countSnoozeCond}
				),
				thread_to_conversation AS (
					SELECT
						raw_thread_id,
						CASE
							WHEN thread_id IS NOT NULL THEN raw_thread_id
							WHEN normalized_subject != '' THEN MIN(raw_thread_id) OVER (PARTITION BY normalized_subject)
							ELSE raw_thread_id
						END as conversation_id
					FROM folder_emails
					GROUP BY raw_thread_id, normalized_subject, thread_id
				)
				SELECT COUNT(DISTINCT conversation_id) as total
				FROM thread_to_conversation`,
				folder,
			),
		][0] as { total: number } | undefined;
		return row?.total ?? 0;
	}

	// ── Single email operations (Drizzle) ──────────────────────────

	async getEmail(id: string) {
		const email = this.db
			.select()
			.from(schema.emails)
			.where(eq(schema.emails.id, id))
			.get();

		if (!email) return null;

		const emailAttachments = this.db
			.select()
			.from(schema.attachments)
			.where(eq(schema.attachments.email_id, id))
			.all();

		const labels = await this.getEmailLabels(id);

		return {
			...email,
			read: !!email.read,
			starred: !!email.starred,
			attachments: emailAttachments,
			labels,
		};
	}

	/**
	 * Fetch all emails in a thread with full bodies and attachments in
	 * two queries (one for emails, one for attachments) instead of
	 * N+1 individual getEmail calls.
	 */
	async getThreadEmails(threadId: string) {
		const emailRows = [
			...this.ctx.storage.sql.exec(
				`SELECT * FROM emails WHERE thread_id = ?1 ORDER BY date ASC`,
				threadId,
			),
		] as any[];

		if (emailRows.length === 0) return [];

		const emailIds = emailRows.map((e) => e.id as string);

		// Batch-fetch all attachments for the thread in a single query
		const placeholders = emailIds.map((_, i) => `?${i + 1}`).join(",");
		const attachmentRows = [
			...this.ctx.storage.sql.exec(
				`SELECT * FROM attachments WHERE email_id IN (${placeholders})`,
				...emailIds,
			),
		] as any[];

		// Group attachments by email_id
		const attachmentsByEmail = new Map<string, any[]>();
		for (const att of attachmentRows) {
			const list = attachmentsByEmail.get(att.email_id) || [];
			list.push(att);
			attachmentsByEmail.set(att.email_id, list);
		}

		return emailRows.map((email) => ({
			...email,
			read: !!email.read,
			starred: !!email.starred,
			attachments: attachmentsByEmail.get(email.id) || [],
		}));
	}

	async updateEmail(
		id: string,
		{ read, starred }: { read?: boolean; starred?: boolean },
	) {
		const data: { read?: number; starred?: number } = {};
		if (read !== undefined) {
			data.read = read ? 1 : 0;
		}
		if (starred !== undefined) {
			data.starred = starred ? 1 : 0;
		}

		if (Object.keys(data).length === 0) {
			return this.getEmail(id);
		}

		this.db
			.update(schema.emails)
			.set(data)
			.where(eq(schema.emails.id, id))
			.run();

		return this.getEmail(id);
	}

	async markThreadRead(threadId: string) {
		this.ctx.storage.sql.exec(
			`UPDATE emails SET read = 1 WHERE thread_id = ? AND read = 0`,
			threadId,
		);
		return { threadId, markedRead: true };
	}

	async deleteEmail(id: string) {
		const email = this.db
			.select({ id: schema.emails.id })
			.from(schema.emails)
			.where(eq(schema.emails.id, id))
			.get();

		if (!email) return null;

		const emailAttachments = this.db
			.select({
				id: schema.attachments.id,
				filename: schema.attachments.filename,
			})
			.from(schema.attachments)
			.where(eq(schema.attachments.email_id, id))
			.all();

		this.db
			.delete(schema.emails)
			.where(eq(schema.emails.id, id))
			.run();

		return emailAttachments;
	}

	async getAttachment(id: string) {
		return (
			this.db
				.select()
				.from(schema.attachments)
				.where(eq(schema.attachments.id, id))
				.get() ?? null
		);
	}

	// ── Folders (Drizzle) ──────────────────────────────────────────

	async getFolders() {
		const result = this.db
			.select({
				id: schema.folders.id,
				name: schema.folders.name,
				unreadCount: sql<number>`COALESCE(SUM(CASE WHEN ${schema.emails.read} = 0 THEN 1 ELSE 0 END), 0)`.mapWith(Number),
			})
			.from(schema.folders)
			.leftJoin(schema.emails, eq(schema.emails.folder_id, schema.folders.id))
			.groupBy(schema.folders.id, schema.folders.name)
			.all();
		return result;
	}

	async getMailboxSummary() {
		const inboxUnread = this.db
			.select({ count: sql<number>`COUNT(*)` })
			.from(schema.emails)
			.where(and(
				eq(schema.emails.folder_id, Folders.INBOX),
				eq(schema.emails.read, 0)
			))
			.get();

		const latestEmail = this.db
			.select({
				sender: schema.emails.sender,
				subject: schema.emails.subject,
				date: schema.emails.date,
			})
			.from(schema.emails)
			.where(eq(schema.emails.folder_id, Folders.INBOX))
			.orderBy(desc(schema.emails.date))
			.limit(1)
			.get();

		return {
			inboxUnreadCount: inboxUnread?.count ?? 0,
			latestEmail: latestEmail ?? null,
		};
	}

	async createFolder(id: string, name: string, is_deletable: number = 1) {
		try {
			const result = this.db
				.insert(schema.folders)
				.values({ id, name, is_deletable })
				.returning({ id: schema.folders.id, name: schema.folders.name })
				.get();
			return { ...result, unreadCount: 0 };
		} catch (e: unknown) {
			if (e instanceof Error && e.message.includes("UNIQUE constraint failed")) {
				return null;
			}
			throw e;
		}
	}

	async updateFolder(id: string, name: string) {
		const result = this.db
			.update(schema.folders)
			.set({ name })
			.where(eq(schema.folders.id, id))
			.returning({ id: schema.folders.id, name: schema.folders.name })
			.get();
		return result;
	}

	async deleteFolder(id: string) {
		const folder = this.db
			.select({ is_deletable: schema.folders.is_deletable })
			.from(schema.folders)
			.where(eq(schema.folders.id, id))
			.get();

		if (!folder || folder.is_deletable === 0) {
			return false;
		}

		this.db
			.delete(schema.folders)
			.where(eq(schema.folders.id, id))
			.run();

		return true;
	}

	async moveEmail(id: string, folderId: string) {
		const folder = this.db
			.select({ id: schema.folders.id })
			.from(schema.folders)
			.where(eq(schema.folders.id, folderId))
			.get();

		if (!folder) return false;

		this.db
			.update(schema.emails)
			.set({ folder_id: folderId })
			.where(eq(schema.emails.id, id))
			.run();

		return true;
	}

	// ── Search (raw SQL — dynamic condition builder) ───────────────

	/**
	 * Build WHERE conditions and params for search queries.
	 * Shared between searchEmails and countSearchResults.
	 */
	#buildSearchConditions(
		options: SearchFilterOptions,
		tableAlias = "",
	): { conditions: string[]; params: (string | number)[] } {
		const { query, folder, from, to, subject, date_start, date_end, is_read, is_starred, has_attachment } = options;
		const prefix = tableAlias ? `${tableAlias}.` : "";
		const conditions: string[] = [];
		const params: (string | number)[] = [];
		let paramIdx = 0;

		const addParam = (value: string | number) => {
			paramIdx++;
			params.push(value);
			return `?${paramIdx}`;
		};

		if (query) {
			const p1 = addParam(`%${query}%`);
			const p2 = addParam(`%${query}%`);
			const p3 = addParam(`%${query}%`);
			const p4 = addParam(`%${query}%`);
			conditions.push(`(${prefix}subject LIKE ${p1} OR ${prefix}body LIKE ${p2} OR ${prefix}sender LIKE ${p3} OR ${prefix}recipient LIKE ${p4} OR ${prefix}cc LIKE ${p4} OR ${prefix}bcc LIKE ${p4})`);
		}
		if (folder) {
			const p = addParam(folder);
			conditions.push(`${prefix}folder_id = (SELECT id FROM folders WHERE name = ${p} OR id = ${p} LIMIT 1)`);
		}
		if (from) { const p = addParam(`%${from}%`); conditions.push(`${prefix}sender LIKE ${p}`); }
		if (to) { const p = addParam(`%${to}%`); conditions.push(`(${prefix}recipient LIKE ${p} OR ${prefix}cc LIKE ${p} OR ${prefix}bcc LIKE ${p})`); }
		if (subject) { const p = addParam(`%${subject}%`); conditions.push(`${prefix}subject LIKE ${p}`); }
		if (date_start) { const p = addParam(date_start); conditions.push(`${prefix}date >= ${p}`); }
		if (date_end) { const p = addParam(date_end); conditions.push(`${prefix}date <= ${p}`); }
		if (is_read !== undefined) { const p = addParam(is_read ? 1 : 0); conditions.push(`${prefix}read = ${p}`); }
		if (is_starred !== undefined) { const p = addParam(is_starred ? 1 : 0); conditions.push(`${prefix}starred = ${p}`); }
		if (has_attachment) { conditions.push(`${prefix}id IN (SELECT DISTINCT email_id FROM attachments)`); }

		return { conditions, params };
	}

	async searchEmails(options: SearchFilterOptions & { page?: number; limit?: number }) {
		const { page = 1, limit: rawLimit = 25 } = options;
		const limit = Math.min(Math.max(rawLimit, 1), 100);
		const { conditions, params } = this.#buildSearchConditions(options, "e");

		const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
		const offset = (page - 1) * limit;

		const query = `
			SELECT e.id, e.subject, e.sender, e.recipient, e.cc, e.bcc, e.date,
				e.read, e.starred, e.in_reply_to, e.email_references,
				e.thread_id, e.folder_id,
				SUBSTR(e.body, 1, 300) as snippet,
				f.name as folder_name
			FROM emails e
			LEFT JOIN folders f ON e.folder_id = f.id
			${where}
			ORDER BY e.date DESC LIMIT ?${params.length + 1} OFFSET ?${params.length + 2}`;
		params.push(limit, offset);

		const result = this.ctx.storage.sql.exec(query, ...params);
		return [...result].map((row: any) => ({
			...row,
			read: !!row.read,
			starred: !!row.starred,
		}));
	}

	/**
	 * Count total search results matching the given filters (for pagination).
	 */
	async countSearchResults(options: SearchFilterOptions) {
		const { conditions, params } = this.#buildSearchConditions(options);

		const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
		const query = `SELECT COUNT(*) as total FROM emails ${where}`;

		const row = [...this.ctx.storage.sql.exec(query, ...params)][0] as
			| { total: number }
			| undefined;
		return row?.total ?? 0;
	}

	// ── Threading helpers (raw SQL) ────────────────────────────────

	async findThreadBySubject(subject: string, senderAddress?: string): Promise<string | null> {
		const normalized = subject
			.replace(/^(?:(?:re|fwd?|fw|aw|wg|r[eé]f|sv)\s*:\s*)+/i, "")
			.trim()
			.toLowerCase();

		if (!normalized) return null;

		const result = this.ctx.storage.sql.exec(
			`SELECT thread_id, subject,
			        GROUP_CONCAT(DISTINCT LOWER(sender)) as senders,
			        GROUP_CONCAT(DISTINCT LOWER(recipient)) as recipients
			 FROM emails
			 WHERE thread_id IS NOT NULL
			   AND thread_id != id
			   AND date >= datetime('now', '-7 days')
			 GROUP BY thread_id
			 ORDER BY MAX(date) DESC
			 LIMIT 50`,
		);

		const normalizedSender = senderAddress?.toLowerCase().trim();

		for (const row of result) {
			const rowSubject = String((row as any).subject || "")
				.replace(/^(?:(?:re|fwd?|fw|aw|wg|r[eé]f|sv)\s*:\s*)+/i, "")
				.trim()
				.toLowerCase();
			if (rowSubject !== normalized) continue;

			if (normalizedSender) {
				const threadSenders = String((row as any).senders || "");
				const threadRecipients = String((row as any).recipients || "");
				const allParticipants = `${threadSenders},${threadRecipients}`;
				if (!allParticipants.includes(normalizedSender)) {
					continue;
				}
			}

			return String((row as any).thread_id);
		}
		return null;
	}

	// ── Rate limiting (raw SQL) ────────────────────────────────────

	/**
	 * Check if the mailbox has exceeded the send rate limit.
	 * Limits: 20 emails per hour, 100 per day per mailbox.
	 * Returns null if under limit, or an error message string if exceeded.
	 */
	async checkSendRateLimit(): Promise<string | null> {
		const hourRow = [...this.ctx.storage.sql.exec(
			`SELECT COUNT(*) as cnt FROM emails
			 WHERE folder_id = ?1
			   AND date >= datetime('now', '-1 hour')`,
			Folders.SENT,
		)][0] as { cnt: number } | undefined;

		if ((hourRow?.cnt ?? 0) >= 20) {
			return "Rate limit exceeded: max 20 emails per hour per mailbox";
		}

		const dayRow = [...this.ctx.storage.sql.exec(
			`SELECT COUNT(*) as cnt FROM emails
			 WHERE folder_id = ?1
			   AND date >= datetime('now', '-1 day')`,
			Folders.SENT,
		)][0] as { cnt: number } | undefined;

		if ((dayRow?.cnt ?? 0) >= 100) {
			return "Rate limit exceeded: max 100 emails per day per mailbox";
		}

		return null;
	}

	// ── Email creation (Drizzle) ───────────────────────────────────

	// ── Labels ────────────────────────────────────────────────────────

	async listLabels() {
		return this.db.select().from(schema.labels).orderBy(asc(schema.labels.name)).all();
	}

	async createLabel(id: string, name: string, color: string) {
		const existing = this.db.select({ id: schema.labels.id }).from(schema.labels).all();
		if (existing.length >= 20) throw new Error("Max 20 labels per mailbox");
		try {
			return this.db.insert(schema.labels).values({ id, name, color }).returning().get();
		} catch (e: unknown) {
			if (e instanceof Error && e.message.includes("UNIQUE")) return null;
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

	async applyLabel(emailId: string, labelId: string) {
		const email = this.db.select({ thread_id: schema.emails.thread_id })
			.from(schema.emails).where(eq(schema.emails.id, emailId)).get();
		const threadId = email?.thread_id || emailId;

		const threadEmails = [...this.ctx.storage.sql.exec(
			`SELECT id FROM emails WHERE thread_id = ?1 OR id = ?1`, threadId,
		)] as any[];
		for (const row of threadEmails) {
			try {
				this.db.insert(schema.emailLabels).values({ email_id: row.id, label_id: labelId }).run();
			} catch { /* already applied — skip */ }
		}
		return true;
	}

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

	async getLabelsForEmails(emailIds: string[]): Promise<Record<string, { id: string; name: string; color: string }[]>> {
		if (emailIds.length === 0) return {};
		const rows = this.db.select({
			emailId: schema.emailLabels.email_id,
			id: schema.labels.id,
			name: schema.labels.name,
			color: schema.labels.color,
		})
			.from(schema.emailLabels)
			.innerJoin(schema.labels, eq(schema.emailLabels.label_id, schema.labels.id))
			.where(inArray(schema.emailLabels.email_id, emailIds))
			.all();

		const map: Record<string, { id: string; name: string; color: string }[]> = {};
		for (const row of rows) {
			if (!map[row.emailId]) map[row.emailId] = [];
			map[row.emailId].push({ id: row.id, name: row.name, color: row.color });
		}
		return map;
	}

	// ── Alarm queue ───────────────────────────────────────────────────

	async #enqueueAlarm(type: string, payload: Record<string, string>, fireAt: string) {
		const id = crypto.randomUUID();
		this.ctx.storage.sql.exec(
			`INSERT INTO pending_alarms (id, type, payload, fire_at) VALUES (?, ?, ?, ?)`,
			id, type, JSON.stringify(payload), fireAt,
		);
		const existing = await this.ctx.storage.getAlarm();
		const newTime = new Date(fireAt).getTime();
		if (!existing || newTime < existing) {
			await this.ctx.storage.setAlarm(newTime);
		}
	}

	async #dequeueEarliestAlarm() {
		const rows = [...this.ctx.storage.sql.exec(
			`SELECT * FROM pending_alarms ORDER BY fire_at ASC LIMIT 1`,
		)] as any[];
		return rows[0] ?? null;
	}

	async #deleteAlarm(id: string) {
		this.ctx.storage.sql.exec(`DELETE FROM pending_alarms WHERE id = ?`, id);
	}

	async #rearmNextAlarm() {
		const next = await this.#dequeueEarliestAlarm();
		if (next) await this.ctx.storage.setAlarm(new Date(next.fire_at).getTime());
	}

	async alarm() {
		const entry = await this.#dequeueEarliestAlarm();
		if (!entry) return;

		const now = new Date().toISOString();
		if (entry.fire_at > now) {
			await this.ctx.storage.setAlarm(new Date(entry.fire_at).getTime());
			return;
		}

		await this.#deleteAlarm(entry.id);
		const payload = JSON.parse(entry.payload) as Record<string, string>;

		try {
			if (entry.type === "snooze") {
				await this.#processSnoozeAlarm(payload.emailId);
			} else if (entry.type === "send") {
				await this.#processScheduledSend(payload.emailId, payload.mailboxId);
			} else if (entry.type === "remind-unanswered") {
				await this.#processUnansweredReminder(payload.emailId, payload.mailboxId);
			} else if (entry.type === "daily-digest") {
				await this.#processDailyDigest(payload.mailboxId);
			}
		} catch (e) {
			console.error(`alarm() failed for type=${entry.type}:`, (e as Error).message);
		} finally {
			await this.#rearmNextAlarm();
		}
	}

	async #processSnoozeAlarm(emailId: string) {
		const email = this.db.select({ id: schema.emails.id })
			.from(schema.emails).where(eq(schema.emails.id, emailId)).get();
		if (!email) return;
		this.ctx.storage.sql.exec(
			`UPDATE emails SET snooze_until = NULL, folder_id = 'inbox' WHERE id = ?`,
			emailId,
		);
	}

	async #processScheduledSend(emailId: string, mailboxId: string) {
		const email = this.db.select().from(schema.emails)
			.where(eq(schema.emails.id, emailId)).get();
		if (!email || email.folder_id !== "draft") return;

		const settingsObj = await this.env.BUCKET.get(`mailboxes/${mailboxId}.json`);
		const settings = settingsObj ? await settingsObj.json() as Record<string, any> : {};

		await sendEmail(this.env.EMAIL, {
			to: email.recipient || "",
			from: { name: settings.fromName || mailboxId, email: mailboxId },
			subject: email.subject || "",
			html: email.body || "",
		});

		this.ctx.storage.sql.exec(
			`UPDATE emails SET folder_id = 'sent', scheduled_send_at = NULL, read = 1 WHERE id = ?`,
			emailId,
		);
	}

	async #processUnansweredReminder(emailId: string, mailboxId: string) {
		const emailRows = [...this.ctx.storage.sql.exec(
			`SELECT id, subject, recipient, thread_id, created_at FROM emails WHERE id = ?`, emailId,
		)] as any[];
		const email = emailRows[0];
		if (!email || !email.thread_id) return;

		const hasReply = await this.#threadHasReplyAfter(email.thread_id, email.created_at);
		if (hasReply) return;

		const settingsObj = await this.env.BUCKET.get(`mailboxes/${mailboxId}.json`);
		const settings = settingsObj ? await settingsObj.json() as Record<string, any> : {};
		const daysSent = Math.floor((Date.now() - new Date(email.created_at).getTime()) / 86400_000);

		const reminderNotif = await getEffectiveNotifications(this.env.BUCKET, mailboxId);
		await sendReminderNotification(reminderNotif, {
			subject: email.subject || "(no subject)",
			recipient: email.recipient || "",
			daysSent,
			mailboxId,
			emailId,
		});
	}

	async #processDailyDigest(mailboxId: string) {
		const settingsObj = await this.env.BUCKET.get(`mailboxes/${mailboxId}.json`);
		const settings = settingsObj ? await settingsObj.json() as Record<string, any> : {};
		const unansweredDays = settings.unansweredDays ?? 3;
		const digestTime = settings.digestTime ?? "08:00";

		const data = await this.#compileDailyDigest(unansweredDays);
		const summary = await synthesizeDigest(this.env.AI, data).catch(() => "");
		const digestNotif = await getEffectiveNotifications(this.env.BUCKET, mailboxId);
		await sendDigestNotification(digestNotif, data, summary);

		await this.ctx.storage.put("lastDigestAt", new Date().toISOString());

		// Re-arm for next day
		const next = nextDigestFireAt(digestTime);
		await this.#enqueueAlarm("daily-digest", { mailboxId }, next);
	}

	// ── Snooze ────────────────────────────────────────────────────────

	async snoozeEmail(emailId: string, until: string) {
		this.ctx.storage.sql.exec(
			`UPDATE emails SET snooze_until = ? WHERE id = ?`, until, emailId,
		);
		await this.#enqueueAlarm("snooze", { emailId }, until);
		return true;
	}

	async unsnoozeEmail(emailId: string) {
		this.ctx.storage.sql.exec(
			`UPDATE emails SET snooze_until = NULL WHERE id = ?`, emailId,
		);
		this.ctx.storage.sql.exec(
			`DELETE FROM pending_alarms WHERE type = 'snooze' AND json_extract(payload, '$.emailId') = ?`,
			emailId,
		);
	}

	async scheduleEmail(emailId: string, sendAt: string, mailboxId: string) {
		this.ctx.storage.sql.exec(
			`UPDATE emails SET scheduled_send_at = ? WHERE id = ?`, sendAt, emailId,
		);
		await this.#enqueueAlarm("send", { emailId, mailboxId }, sendAt);
		return true;
	}

	async cancelScheduledEmail(emailId: string) {
		this.ctx.storage.sql.exec(
			`UPDATE emails SET scheduled_send_at = NULL WHERE id = ?`, emailId,
		);
		this.ctx.storage.sql.exec(
			`DELETE FROM pending_alarms WHERE type = 'send' AND json_extract(payload, '$.emailId') = ?`,
			emailId,
		);
	}

	async getSnoozedEmails(page = 1, limit = 25) {
		const offset = (page - 1) * limit;
		return [...this.ctx.storage.sql.exec(
			`SELECT * FROM emails WHERE snooze_until > datetime('now') ORDER BY snooze_until ASC LIMIT ?1 OFFSET ?2`,
			limit, offset,
		)].map((row: any) => ({ ...row, read: !!row.read, starred: !!row.starred }));
	}

	async getScheduledEmails(page = 1, limit = 25) {
		const offset = (page - 1) * limit;
		return [...this.ctx.storage.sql.exec(
			`SELECT * FROM emails WHERE scheduled_send_at IS NOT NULL AND folder_id = 'draft' ORDER BY scheduled_send_at ASC LIMIT ?1 OFFSET ?2`,
			limit, offset,
		)].map((row: any) => ({ ...row, read: !!row.read, starred: !!row.starred }));
	}

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

	async searchContacts(query: string, limit = 10) {
		const q = `%${query.toLowerCase()}%`;
		return [...this.ctx.storage.sql.exec(
			`SELECT * FROM contacts WHERE LOWER(email) LIKE ?1 OR LOWER(COALESCE(name,'')) LIKE ?1
			 ORDER BY frequency DESC, last_seen DESC LIMIT ?2`,
			q, limit,
		)] as any[];
	}

	async listContacts(page = 1, limit = 50) {
		const offset = (page - 1) * limit;
		return [...this.ctx.storage.sql.exec(
			`SELECT * FROM contacts ORDER BY frequency DESC, last_seen DESC LIMIT ?1 OFFSET ?2`,
			limit, offset,
		)] as any[];
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

	// ── Triage ────────────────────────────────────────────────────────

	async setEmailTriage(emailId: string, triage: { category: string; priority: number; confidence: number; reason: string }) {
		this.ctx.storage.sql.exec(
			`UPDATE emails SET triage_category = ?, triage_priority = ?, triage_confidence = ?, triage_summary = ? WHERE id = ?`,
			triage.category, triage.priority, triage.confidence, triage.reason, emailId,
		);
	}

	async getEmailTriage(emailId: string) {
		const rows = [...this.ctx.storage.sql.exec(
			`SELECT triage_category, triage_priority, triage_summary, triage_confidence FROM emails WHERE id = ?`,
			emailId,
		)] as any[];
		return rows[0] ?? null;
	}

	// Creates a system label for a triage category if it doesn't exist, returns label id.
	async ensureSystemLabel(category: string): Promise<string | null> {
		const SYSTEM_LABELS: Record<string, { name: string; color: string }> = {
			personal:     { name: "Personal",     color: "#3b82f6" },
			business:     { name: "Business",     color: "#8b5cf6" },
			newsletter:   { name: "Newsletter",   color: "#06b6d4" },
			notification: { name: "Notification", color: "#f59e0b" },
			spam:         { name: "Spam",         color: "#ef4444" },
		};
		const def = SYSTEM_LABELS[category];
		if (!def) return null;

		const labelId = `ai-${category}`;
		try {
			this.ctx.storage.sql.exec(
				`INSERT OR IGNORE INTO labels (id, name, color) VALUES (?, ?, ?)`,
				labelId, def.name, def.color,
			);
		} catch { /* ignore */ }
		return labelId;
	}

	// Thread summarization helpers
	async countThreadEmails(threadId: string): Promise<number> {
		const rows = [...this.ctx.storage.sql.exec(
			`SELECT COUNT(*) as cnt FROM emails WHERE thread_id = ?`, threadId,
		)] as any[];
		return rows[0]?.cnt ?? 0;
	}

	async setThreadSummary(emailId: string, summary: string) {
		this.ctx.storage.sql.exec(
			`UPDATE emails SET triage_summary = ? WHERE id = ?`, summary, emailId,
		);
	}

	// Priority inbox: unread first, then priority DESC, then date DESC
	async getPriorityInboxEmails(page = 1, limit = 50) {
		const safeLimit = Math.min(Math.max(limit, 1), 100);
		const offset = (page - 1) * safeLimit;
		const rows = [...this.ctx.storage.sql.exec(
			`SELECT id, subject, sender, recipient, date, read, starred, thread_id, folder_id,
			        triage_category, triage_priority, triage_summary, triage_confidence,
			        SUBSTR(body, 1, 300) as snippet
			 FROM emails
			 WHERE folder_id = 'inbox'
			   AND (snooze_until IS NULL OR snooze_until <= datetime('now'))
			 ORDER BY
			   CASE WHEN read = 0 THEN 0 ELSE 1 END ASC,
			   COALESCE(triage_priority, 0) DESC,
			   date DESC
			 LIMIT ?1 OFFSET ?2`,
			safeLimit, offset,
		)] as any[];
		return rows.map((row) => ({ ...row, read: !!row.read, starred: !!row.starred }));
	}

	async countPriorityInboxEmails(): Promise<number> {
		const rows = [...this.ctx.storage.sql.exec(
			`SELECT COUNT(*) as cnt FROM emails
			 WHERE folder_id = 'inbox'
			   AND (snooze_until IS NULL OR snooze_until <= datetime('now'))`,
		)] as any[];
		return rows[0]?.cnt ?? 0;
	}

	// ── Action Items ──────────────────────────────────────────────────

	async createActionItem(item: { emailId: string; description: string; dueDate?: string | null }) {
		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		this.ctx.storage.sql.exec(
			`INSERT INTO action_items (id, email_id, description, due_date, created_at) VALUES (?, ?, ?, ?, ?)`,
			id, item.emailId, item.description, item.dueDate ?? null, now,
		);
		return id;
	}

	async listActionItems(opts: { pendingOnly?: boolean; limit?: number } = {}) {
		const limit = opts.limit ?? 50;
		const rows = opts.pendingOnly
			? [...this.ctx.storage.sql.exec(
				`SELECT id, email_id, description, due_date, completed_at, created_at
				 FROM action_items WHERE completed_at IS NULL ORDER BY created_at ASC LIMIT ?`,
				limit,
			)]
			: [...this.ctx.storage.sql.exec(
				`SELECT id, email_id, description, due_date, completed_at, created_at
				 FROM action_items ORDER BY created_at ASC LIMIT ?`,
				limit,
			)];
		return (rows as any[]).map((r) => ({
			id: r.id, emailId: r.email_id, description: r.description,
			dueDate: r.due_date ?? null, completedAt: r.completed_at ?? null, createdAt: r.created_at,
		}));
	}

	async completeActionItem(id: string) {
		this.ctx.storage.sql.exec(
			`UPDATE action_items SET completed_at = datetime('now') WHERE id = ?`, id,
		);
		return true;
	}

	async deleteActionItem(id: string) {
		this.ctx.storage.sql.exec(`DELETE FROM action_items WHERE id = ?`, id);
		return true;
	}

	// ── Unanswered / Follow-up ────────────────────────────────────────

	async #threadHasReplyAfter(threadId: string, sentAt: string): Promise<boolean> {
		const rows = [...this.ctx.storage.sql.exec(
			`SELECT COUNT(*) as cnt FROM emails
			 WHERE thread_id = ? AND folder_id = 'inbox' AND created_at > ?`,
			threadId, sentAt,
		)] as any[];
		return (rows[0]?.cnt ?? 0) > 0;
	}

	async getPendingFollowUps(days = 3) {
		const rows = [...this.ctx.storage.sql.exec(
			`SELECT e.id, e.subject, e.sender, e.recipient, e.date, e.thread_id
			 FROM emails e
			 WHERE e.folder_id = 'sent'
			   AND e.created_at < datetime('now', '-' || ? || ' days')
			   AND NOT EXISTS (
			     SELECT 1 FROM emails r
			     WHERE r.thread_id = e.thread_id
			       AND r.folder_id = 'inbox'
			       AND r.created_at > e.created_at
			   )
			 ORDER BY e.created_at ASC LIMIT 20`,
			days,
		)] as any[];
		return rows;
	}

	async scheduleFollowUpReminder(emailId: string, mailboxId: string) {
		const settingsObj = await this.env.BUCKET.get(`mailboxes/${mailboxId}.json`);
		const settings = settingsObj ? await settingsObj.json() as Record<string, any> : {};
		const days = settings.unansweredDays ?? 3;
		const fireAt = new Date(Date.now() + days * 86400_000).toISOString();
		await this.#enqueueAlarm("remind-unanswered", { emailId, mailboxId }, fireAt);
	}

	async cancelFollowUpReminder(emailId: string) {
		this.ctx.storage.sql.exec(
			`DELETE FROM pending_alarms WHERE type = 'remind-unanswered' AND json_extract(payload, '$.emailId') = ?`,
			emailId,
		);
	}

	// ── Daily Digest ──────────────────────────────────────────────────

	async #compileDailyDigest(unansweredDays = 3) {
		const lastDigestAt = await this.ctx.storage.get<string>("lastDigestAt");
		const since = lastDigestAt ?? new Date(Date.now() - 86400_000).toISOString();

		const [newEmailsRows, topEmailsRows, pendingActions, overdueActions, followUps] = await Promise.all([
			[...this.ctx.storage.sql.exec(
				`SELECT COUNT(*) as cnt FROM emails WHERE folder_id = 'inbox' AND created_at > ?`, since,
			)] as any[],
			[...this.ctx.storage.sql.exec(
				`SELECT id, subject, sender, triage_priority FROM emails
				 WHERE folder_id = 'inbox' AND read = 0 AND triage_priority >= 3
				 ORDER BY triage_priority DESC, date DESC LIMIT 5`,
			)] as any[],
			this.listActionItems({ pendingOnly: true, limit: 5 }),
			[...this.ctx.storage.sql.exec(
				`SELECT id, email_id, description, due_date FROM action_items
				 WHERE due_date < date('now') AND completed_at IS NULL LIMIT 5`,
			)] as any[],
			this.getPendingFollowUps(unansweredDays),
		]);

		return {
			newEmailsCount: newEmailsRows[0]?.cnt ?? 0,
			topEmails: topEmailsRows,
			pendingActions,
			overdueActions,
			followUps: followUps.slice(0, 3),
			lastDigestAt: since,
		};
	}

	async seedDigestAlarm(digestTime: string, mailboxId: string) {
		// Cancel any existing daily-digest alarm for this mailbox
		this.ctx.storage.sql.exec(
			`DELETE FROM pending_alarms WHERE type = 'daily-digest'`,
		);
		const fireAt = nextDigestFireAt(digestTime);
		await this.#enqueueAlarm("daily-digest", { mailboxId }, fireAt);
	}

	async cancelDigestAlarm() {
		this.ctx.storage.sql.exec(
			`DELETE FROM pending_alarms WHERE type = 'daily-digest'`,
		);
	}

	// ── Embedding tracking (Phase 5.1) ────────────────────────────────

	async markEmbedded(emailId: string): Promise<void> {
		this.db.insert(schema.emailEmbeddings).values({
			email_id: emailId,
			embedded_at: new Date().toISOString(),
		}).onConflictDoNothing().run();
	}

	async isEmbedded(emailId: string): Promise<boolean> {
		const row = this.db.select({ email_id: schema.emailEmbeddings.email_id })
			.from(schema.emailEmbeddings)
			.where(eq(schema.emailEmbeddings.email_id, emailId))
			.get();
		return !!row;
	}

	async getEmailsByIds(ids: string[]): Promise<Array<{ id: string; subject: string | null; sender: string | null; date: string | null; body: string | null; triage_priority: number | null }>> {
		if (ids.length === 0) return [];
		return this.db.select({
			id: schema.emails.id,
			subject: schema.emails.subject,
			sender: schema.emails.sender,
			date: schema.emails.date,
			body: schema.emails.body,
			triage_priority: schema.emails.triage_priority,
		}).from(schema.emails)
			.where(sql`${schema.emails.id} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`)
			.all();
	}

	// ── Contact intelligence (Phase 5.3) ──────────────────────────────

	async computeContactIntelligence(contactEmail: string): Promise<Record<string, unknown>> {
		const email = contactEmail.toLowerCase();

		// Total counts split by direction
		const countRow = [...this.ctx.storage.sql.exec(
			`SELECT
				COUNT(*) as total,
				SUM(CASE WHEN LOWER(sender) LIKE ? THEN 1 ELSE 0 END) as received,
				SUM(CASE WHEN LOWER(recipient) LIKE ? OR LOWER(cc) LIKE ? THEN 1 ELSE 0 END) as sent
			FROM emails
			WHERE LOWER(sender) LIKE ? OR LOWER(recipient) LIKE ? OR LOWER(cc) LIKE ?`,
			`%${email}%`, `%${email}%`, `%${email}%`,
			`%${email}%`, `%${email}%`, `%${email}%`,
		)][0] as { total: number; received: number; sent: number } | undefined;

		const total = countRow?.total ?? 0;
		const emailsReceived = countRow?.received ?? 0;
		const emailsSent = countRow?.sent ?? 0;

		// First / last contact dates
		const datesRow = [...this.ctx.storage.sql.exec(
			`SELECT MIN(date) as first_contact, MAX(date) as last_contact FROM emails WHERE LOWER(sender) LIKE ? OR LOWER(recipient) LIKE ?`,
			`%${email}%`, `%${email}%`,
		)][0] as { first_contact: string | null; last_contact: string | null } | undefined;

		// Average response time: how long before user replied to this contact
		const responseRow = [...this.ctx.storage.sql.exec(
			`SELECT AVG((julianday(reply.date) - julianday(orig.date)) * 24) as avg_hours
			FROM emails orig
			JOIN emails reply ON reply.thread_id = orig.thread_id
			WHERE LOWER(orig.sender) LIKE ?
			  AND reply.folder_id = (SELECT id FROM folders WHERE name = 'sent' LIMIT 1)
			  AND reply.date > orig.date`,
			`%${email}%`,
		)][0] as { avg_hours: number | null } | undefined;

		// Recent subjects for topic extraction
		const subjectRows = [...this.ctx.storage.sql.exec(
			`SELECT subject FROM emails WHERE LOWER(sender) LIKE ? OR LOWER(recipient) LIKE ? ORDER BY date DESC LIMIT 20`,
			`%${email}%`, `%${email}%`,
		)] as Array<{ subject: string }>;
		const subjects = subjectRows.map((r) => r.subject || "");

		// Relationship score heuristic
		const recencyDays = datesRow?.last_contact
			? (Date.now() - new Date(datesRow.last_contact).getTime()) / 86400000
			: 999;
		const avgResponseHours = responseRow?.avg_hours ?? null;
		const recencyPoints = recencyDays < 7 ? 30 : recencyDays < 30 ? 15 : 0;
		const responsePoints = avgResponseHours !== null
			? (avgResponseHours < 24 ? 30 : avgResponseHours < 72 ? 15 : 0)
			: 0;
		const frequencyPoints = Math.min(40, Math.log10(total + 1) * 20);
		const relationshipScore = Math.round(Math.min(100, frequencyPoints + recencyPoints + responsePoints));

		return {
			totalEmails: total,
			emailsSent,
			emailsReceived,
			firstContact: datesRow?.first_contact ?? null,
			lastContact: datesRow?.last_contact ?? null,
			avgResponseTimeHours: avgResponseHours,
			topTopics: subjects, // raw subjects — caller runs AI extraction separately
			relationshipScore,
			computedAt: new Date().toISOString(),
		};
	}

	async updateContactIntelligenceTopics(contactEmail: string, topics: string[]): Promise<void> {
		const contact = this.db.select({ intelligence: schema.contacts.intelligence })
			.from(schema.contacts)
			.where(eq(schema.contacts.email, contactEmail.toLowerCase()))
			.get();
		if (!contact?.intelligence) return;
		try {
			const parsed = JSON.parse(contact.intelligence) as Record<string, unknown>;
			parsed.topTopics = topics;
			parsed.topicsExtracted = true;
			this.db.update(schema.contacts)
				.set({ intelligence: JSON.stringify(parsed) })
				.where(eq(schema.contacts.email, contactEmail.toLowerCase()))
				.run();
		} catch { /* ignore parse errors */ }
	}

	async getContactIntelligence(contactEmail: string): Promise<Record<string, unknown> | null> {
		const contact = this.db.select({ id: schema.contacts.id, intelligence: schema.contacts.intelligence })
			.from(schema.contacts)
			.where(eq(schema.contacts.email, contactEmail.toLowerCase()))
			.get();
		if (!contact) return null;

		if (contact.intelligence) {
			try {
				const cached = JSON.parse(contact.intelligence) as Record<string, unknown>;
				const computedAt = cached.computedAt as string | undefined;
				if (computedAt) {
					const ageMs = Date.now() - new Date(computedAt).getTime();
					if (ageMs < 7 * 24 * 60 * 60 * 1000) return cached; // fresh within 7 days
				}
			} catch { /* recompute if JSON is malformed */ }
		}

		const stats = await this.computeContactIntelligence(contactEmail);
		this.db.update(schema.contacts)
			.set({ intelligence: JSON.stringify(stats) })
			.where(eq(schema.contacts.email, contactEmail.toLowerCase()))
			.run();
		return stats;
	}

	// ── Automation rules CRUD (Phase 5.4) ─────────────────────────────

	async createRule(rule: { name: string; conditions: unknown[]; actions: unknown[]; priority?: number }): Promise<string> {
		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		this.db.insert(schema.automationRules).values({
			id, name: rule.name,
			enabled: 1, priority: rule.priority ?? 0,
			conditions: JSON.stringify(rule.conditions),
			actions: JSON.stringify(rule.actions),
			created_at: now, updated_at: now,
		}).run();
		return id;
	}

	async listRules(enabledOnly = false): Promise<Array<Record<string, unknown>>> {
		const rows = this.db.select().from(schema.automationRules)
			.where(enabledOnly ? eq(schema.automationRules.enabled, 1) : undefined)
			.orderBy(asc(schema.automationRules.priority))
			.all();
		return rows.map((r) => ({
			...r,
			enabled: !!r.enabled,
			conditions: JSON.parse(r.conditions as string),
			actions: JSON.parse(r.actions as string),
		}));
	}

	async updateRule(id: string, updates: { name?: string; enabled?: boolean; priority?: number; conditions?: unknown[]; actions?: unknown[] }): Promise<boolean> {
		const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
		if (updates.name !== undefined) patch.name = updates.name;
		if (updates.enabled !== undefined) patch.enabled = updates.enabled ? 1 : 0;
		if (updates.priority !== undefined) patch.priority = updates.priority;
		if (updates.conditions !== undefined) patch.conditions = JSON.stringify(updates.conditions);
		if (updates.actions !== undefined) patch.actions = JSON.stringify(updates.actions);
		const result = this.db.update(schema.automationRules).set(patch)
			.where(eq(schema.automationRules.id, id)).run();
		return (result as any)?.changes > 0;
	}

	async deleteRule(id: string): Promise<boolean> {
		const result = this.db.delete(schema.automationRules)
			.where(eq(schema.automationRules.id, id)).run();
		return (result as any)?.changes > 0;
	}

	async reorderRules(ids: string[]): Promise<void> {
		const now = new Date().toISOString();
		for (let i = 0; i < ids.length; i++) {
			this.db.update(schema.automationRules)
				.set({ priority: i, updated_at: now })
				.where(eq(schema.automationRules.id, ids[i]))
				.run();
		}
	}

	async evaluateAndApplyRules(emailId: string, mailboxId: string, env: Env): Promise<{ appliedTypes: string[]; pendingWebhooks: Array<{ url: string; payload: Record<string, unknown> }>; movedToFolder: string | null }> {
		const emailRow = this.db.select({
			sender: schema.emails.sender, recipient: schema.emails.recipient,
			subject: schema.emails.subject, body: schema.emails.body,
			triage_category: schema.emails.triage_category, triage_priority: schema.emails.triage_priority,
		}).from(schema.emails).where(eq(schema.emails.id, emailId)).get();
		if (!emailRow) return { appliedTypes: [], pendingWebhooks: [], movedToFolder: null };

		const rules = await this.listRules(true);
		const actions = evaluateAllRules(emailRow as any, rules as any);
		const pendingWebhooks: Array<{ url: string; payload: Record<string, unknown> }> = [];
		let movedToFolder: string | null = null;

		for (const action of actions) {
			try {
				switch (action.type) {
					case "label":
						if (action.params?.labelId) await this.applyLabel(emailId, action.params.labelId);
						break;
					case "move":
						if (action.params?.folder) {
							await this.moveEmail(emailId, action.params.folder);
							movedToFolder = action.params.folder;
						}
						break;
					case "archive":
						await this.moveEmail(emailId, "archive");
						break;
					case "mark_read":
						await this.updateEmail(emailId, { read: true });
						break;
					case "notify": {
						const ruleNotif = await getEffectiveNotifications(env.BUCKET, mailboxId);
						await notifyNewEmail(ruleNotif, {
							sender: emailRow.sender ?? "",
							subject: `[Rule: ${action.params?.message ?? ""}] ${emailRow.subject ?? ""}`,
							mailboxId,
						});
						break;
					}
					case "webhook":
						// Webhook URLs are returned to the caller for ctx.waitUntil() firing
						if (action.params?.url && isValidWebhookUrl(action.params.url)) {
							pendingWebhooks.push({
								url: action.params.url,
								payload: { emailId, subject: emailRow.subject, sender: emailRow.sender },
							});
						}
						break;
				}
			} catch (e) {
				console.error(`Rule action ${action.type} failed:`, (e as Error).message);
			}
		}

		return { appliedTypes: actions.map((a) => a.type), pendingWebhooks, movedToFolder };
	}

	async createEmail(
		folder: string,
		email: EmailData,
		attachments: AttachmentData[],
	) {
		// Resolve folder name or ID to the actual folder ID.
		const folderRow = this.db
			.select({ id: schema.folders.id })
			.from(schema.folders)
			.where(or(eq(schema.folders.id, folder), eq(schema.folders.name, folder)))
			.limit(1)
			.get();

		if (!folderRow) {
			throw new Error(
				`createEmail: folder "${folder}" not found. ` +
					"Ensure the folder exists before inserting an email.",
			);
		}

		const folderId = folderRow.id;
		const isSent = folderId === Folders.SENT;

		// Sent emails are always read — the sender obviously knows what they wrote.
		// This prevents sent replies from inflating thread_unread_count.
		this.db
			.insert(schema.emails)
			.values({
				id: email.id,
				folder_id: folderId,
				subject: email.subject,
				sender: email.sender,
				recipient: email.recipient,
				cc: email.cc ?? null,
				bcc: email.bcc ?? null,
				date: email.date,
				read: isSent ? 1 : (email.read ? 1 : 0),
				starred: email.starred ? 1 : 0,
				body: email.body,
				in_reply_to: email.in_reply_to ?? null,
				email_references: email.email_references ?? null,
				thread_id: email.thread_id ?? null,
				message_id: email.message_id ?? null,
				raw_headers: email.raw_headers ?? null,
			})
			.run();

		if (attachments.length > 0) {
			this.db.insert(schema.attachments).values(attachments).run();
		}
	}

	// ── WooCommerce order cache ────────────────────────────────────────

	async getWooOrders(email: string): Promise<unknown[]> {
		const key = email.toLowerCase();
		const FIFTEEN_MIN_MS = 900_000;

		// Check cache
		const rows = [...this.ctx.storage.sql.exec(
			`SELECT data, fetched_at FROM woo_orders_cache WHERE email = ?`, key,
		)] as Array<{ data: string; fetched_at: number }>;
		const cached = rows[0];

		if (cached && Date.now() - cached.fetched_at < FIFTEEN_MIN_MS) {
			return JSON.parse(cached.data) as unknown[];
		}

		// Load WooCommerce settings from R2
		const mailboxId = this.ctx.id.name;
		const settingsObj = await this.env.BUCKET.get(`mailboxes/${mailboxId}.json`);
		const settings = settingsObj ? await settingsObj.json() as Record<string, any> : {};
		const woo = settings.woocommerce;

		if (!woo?.enabled || !woo.storeUrl || !woo.consumerKey || !woo.consumerSecret) {
			return [];
		}

		const { fetchCustomerOrders } = await import("../lib/woocommerce");
		try {
			const orders = await fetchCustomerOrders(
				{ storeUrl: woo.storeUrl, consumerKey: woo.consumerKey, consumerSecret: woo.consumerSecret },
				key,
				20,
			);
			const data = JSON.stringify(orders);
			this.ctx.storage.sql.exec(
				`INSERT OR REPLACE INTO woo_orders_cache (email, data, fetched_at) VALUES (?, ?, ?)`,
				key, data, Date.now(),
			);
			return orders;
		} catch (err) {
			// Serve stale cache as fallback if available
			if (cached) return JSON.parse(cached.data) as unknown[];
			throw err;
		}
	}
}
