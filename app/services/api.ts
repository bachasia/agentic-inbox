// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import type { Email, Folder, Mailbox, Label, Contact, EmailTemplate, ActionItem, ContactIntelligence, AutomationRule, RuleCondition, RuleAction, WooCommerceOrder, GlobalSettings, DomainInfo, KbArticle, KbArticleInput } from "~/types";

const REQUEST_TIMEOUT_MS = 30_000;

export class ApiError extends Error {
	status: number;
	body: Record<string, unknown>;

	constructor(status: number, body: Record<string, unknown>) {
		super((body.error as string) || `Request failed: ${status}`);
		this.name = "ApiError";
		this.status = status;
		this.body = body;
	}
}

async function request<T>(
	url: string,
	options: RequestInit = {},
): Promise<T> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	// Combine caller signal (e.g. TanStack Query abort) with our timeout signal
	const signal = options.signal
		? AbortSignal.any([options.signal, controller.signal])
		: controller.signal;

	try {
		const res = await fetch(url, {
			...options,
			signal,
			headers: {
				"Content-Type": "application/json",
				...(options.headers as Record<string, string>),
			},
		});

		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			throw new ApiError(res.status, body as Record<string, unknown>);
		}

		if (res.status === 204) return undefined as T;

		const contentType = res.headers.get("content-type") ?? "";
		if (contentType.includes("application/json")) {
			return res.json() as Promise<T>;
		}
		return res.blob() as unknown as T;
	} finally {
		clearTimeout(timeout);
	}
}

function get<T>(url: string, opts?: { params?: Record<string, string>; responseType?: string; signal?: AbortSignal }) {
	const query = opts?.params ? `?${new URLSearchParams(opts.params)}` : "";
	return request<T>(`${url}${query}`, {
		method: "GET",
		signal: opts?.signal,
		...(opts?.responseType === "blob" ? { headers: { Accept: "*/*" } } : {}),
	});
}

function post<T>(url: string, body?: unknown, opts?: { signal?: AbortSignal }) {
	return request<T>(url, {
		method: "POST",
		signal: opts?.signal,
		body: body != null ? JSON.stringify(body) : undefined,
	});
}

function put<T>(url: string, body?: unknown) {
	return request<T>(url, {
		method: "PUT",
		body: body != null ? JSON.stringify(body) : undefined,
	});
}

function del<T>(url: string) {
	return request<T>(url, { method: "DELETE" });
}

// ---------- Typed response shapes ----------

interface EmailListResponse {
	emails: Email[];
	totalCount: number;
}

// ---------- API client ----------

const api = {
	// Config
	getConfig: () =>
		get<{ domains: DomainInfo[]; emailAddresses: string[] }>("/api/v1/config"),

	// Domain management (admin only)
	addDomain: (domain: string) =>
		post<{ domain: string; source: string }>("/api/v1/admin/domains", { domain }),
	deleteDomain: (domain: string) =>
		del<{ ok: boolean }>(`/api/v1/admin/domains/${encodeURIComponent(domain)}`),

	// Mailboxes
	listMailboxes: () => get<Mailbox[]>("/api/v1/mailboxes"),
	createMailbox: (email: string, name: string, settings?: unknown) =>
		post<Mailbox>("/api/v1/mailboxes", { email, name, settings }),
	getMailbox: (mailboxId: string) =>
		get<Mailbox>(`/api/v1/mailboxes/${mailboxId}`),
	updateMailbox: (mailboxId: string, settings: unknown) =>
		put<Mailbox>(`/api/v1/mailboxes/${mailboxId}`, { settings }),
	deleteMailbox: (mailboxId: string) =>
		del<void>(`/api/v1/mailboxes/${mailboxId}`),

	// All-mailboxes unified inbox
	getAllEmails: (folder = "inbox", limit = 25, page = 1) =>
		get<{ emails: Array<Email & { mailboxId: string }>; total: number }>(
			"/api/v1/emails/all",
			{ params: { folder, limit: String(limit), page: String(page) } },
		),

	// Emails
	listEmails: (mailboxId: string, params: Record<string, string>, opts?: { signal?: AbortSignal }) =>
		get<EmailListResponse | Email[]>(`/api/v1/mailboxes/${mailboxId}/emails`, { params, signal: opts?.signal }),
	sendEmail: (mailboxId: string, email: unknown) =>
		post<void>(`/api/v1/mailboxes/${mailboxId}/emails`, email),
	getEmail: (mailboxId: string, id: string, opts?: { signal?: AbortSignal }) =>
		get<Email>(`/api/v1/mailboxes/${mailboxId}/emails/${id}`, { signal: opts?.signal }),
	updateEmail: (mailboxId: string, id: string, data: unknown) =>
		put<Email>(`/api/v1/mailboxes/${mailboxId}/emails/${id}`, data),
	deleteEmail: (mailboxId: string, id: string) =>
		del<void>(`/api/v1/mailboxes/${mailboxId}/emails/${id}`),
	moveEmail: (mailboxId: string, id: string, folderId: string) =>
		post<void>(`/api/v1/mailboxes/${mailboxId}/emails/${id}/move`, { folderId }),
	getThread: (mailboxId: string, threadId: string, opts?: { signal?: AbortSignal }) =>
		get<Email[]>(`/api/v1/mailboxes/${mailboxId}/threads/${threadId}`, { signal: opts?.signal }),
	markThreadRead: (mailboxId: string, threadId: string) =>
		post<void>(`/api/v1/mailboxes/${mailboxId}/threads/${threadId}/read`),
	getAttachment: (mailboxId: string, emailId: string, attachmentId: string) =>
		get<Blob>(`/api/v1/mailboxes/${mailboxId}/emails/${emailId}/attachments/${attachmentId}`, { responseType: "blob" }),
	saveDraft: (
		mailboxId: string,
		draft: {
			to?: string;
			cc?: string;
			bcc?: string;
			subject?: string;
			body: string;
			in_reply_to?: string;
			thread_id?: string;
			draft_id?: string;
		},
	) => post<{ draft_id: string }>(`/api/v1/mailboxes/${mailboxId}/drafts`, draft),
	replyToEmail: (mailboxId: string, emailId: string, email: unknown) =>
		post<void>(`/api/v1/mailboxes/${mailboxId}/emails/${emailId}/reply`, email),
	forwardEmail: (mailboxId: string, emailId: string, email: unknown) =>
		post<void>(`/api/v1/mailboxes/${mailboxId}/emails/${emailId}/forward`, email),
	aiCraftReply: (mailboxId: string, emailId: string) =>
		post<{ body: string }>(`/api/v1/mailboxes/${mailboxId}/emails/${emailId}/ai-craft`),

	// Signature images (used in mailbox settings signature editor)
	uploadSignatureImage: async (mailboxId: string, file: File): Promise<{ url: string; filename: string }> => {
		const formData = new FormData();
		formData.append("file", file);
		// Use fetch directly — Content-Type must be unset so browser sets multipart/form-data boundary.
		const res = await fetch(`/api/v1/mailboxes/${mailboxId}/signature-image`, { method: "POST", body: formData });
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			throw new ApiError(res.status, body as Record<string, unknown>);
		}
		return res.json();
	},

	// Compose inline images (stored separately from signature images)
	uploadComposeImage: async (mailboxId: string, file: File): Promise<{ url: string; filename: string }> => {
		const formData = new FormData();
		formData.append("file", file);
		const res = await fetch(`/api/v1/mailboxes/${mailboxId}/compose-image`, { method: "POST", body: formData });
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			throw new ApiError(res.status, body as Record<string, unknown>);
		}
		return res.json();
	},

	// Notifications
	testNotification: (mailboxId: string, provider: string, settings: Record<string, string>) =>
		post<{ success: boolean; error?: string }>(`/api/v1/mailboxes/${mailboxId}/test-notification`, { provider, settings }),

	// Global settings
	getGlobalSettings: () =>
		get<GlobalSettings>("/api/v1/settings"),
	updateGlobalSettings: (settings: GlobalSettings) =>
		put<GlobalSettings>("/api/v1/settings", settings),
	testGlobalNotification: (provider: "telegram" | "discord", settings: Record<string, string>) =>
		post<{ success: boolean; error?: string }>("/api/v1/settings/test-notification", { provider, settings }),

	// Folders
	listFolders: (mailboxId: string) =>
		get<Folder[]>(`/api/v1/mailboxes/${mailboxId}/folders`),
	createFolder: (mailboxId: string, name: string) =>
		post<Folder>(`/api/v1/mailboxes/${mailboxId}/folders`, { name }),
	updateFolder: (mailboxId: string, id: string, name: string) =>
		put<Folder>(`/api/v1/mailboxes/${mailboxId}/folders/${id}`, { name }),
	deleteFolder: (mailboxId: string, id: string) =>
		del<void>(`/api/v1/mailboxes/${mailboxId}/folders/${id}`),

	// Search
	searchEmails: (mailboxId: string, params: Record<string, string>) =>
		get<EmailListResponse | Email[]>(`/api/v1/mailboxes/${mailboxId}/search`, { params }),

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

	// Snooze & scheduled send
	snoozeEmail: (mailboxId: string, emailId: string, until: string) =>
		post<void>(`/api/v1/mailboxes/${mailboxId}/emails/${emailId}/snooze`, { until }),
	unsnoozeEmail: (mailboxId: string, emailId: string) =>
		del<void>(`/api/v1/mailboxes/${mailboxId}/emails/${emailId}/snooze`),
	scheduleEmail: (mailboxId: string, emailId: string, sendAt: string) =>
		post<void>(`/api/v1/mailboxes/${mailboxId}/emails/${emailId}/schedule`, { sendAt }),
	cancelScheduledEmail: (mailboxId: string, emailId: string) =>
		del<void>(`/api/v1/mailboxes/${mailboxId}/emails/${emailId}/schedule`),
	listSnoozed: (mailboxId: string) =>
		get<EmailListResponse>(`/api/v1/mailboxes/${mailboxId}/snoozed`),
	listScheduled: (mailboxId: string) =>
		get<EmailListResponse>(`/api/v1/mailboxes/${mailboxId}/scheduled`),
	listPriorityInbox: (mailboxId: string, params?: { page?: number; limit?: number }) => {
		const queryParams: Record<string, string> = {};
		if (params?.page) queryParams.page = String(params.page);
		if (params?.limit) queryParams.limit = String(params.limit);
		return get<EmailListResponse>(`/api/v1/mailboxes/${mailboxId}/priority-inbox`, { params: queryParams });
	},
	updateEmailTriage: (mailboxId: string, emailId: string, data: { category?: string; priority?: number }) =>
		put<void>(`/api/v1/mailboxes/${mailboxId}/emails/${emailId}/triage`, data),

	// Contacts
	listContacts: (mailboxId: string, params?: { q?: string; page?: number; limit?: number }) => {
		const queryParams: Record<string, string> = {};
		if (params?.q) queryParams.q = params.q;
		if (params?.page) queryParams.page = String(params.page);
		if (params?.limit) queryParams.limit = String(params.limit);
		return get<Contact[]>(`/api/v1/mailboxes/${mailboxId}/contacts`, { params: queryParams });
	},
	updateContact: (mailboxId: string, id: string, name: string) =>
		put<Contact>(`/api/v1/mailboxes/${mailboxId}/contacts/${id}`, { name }),
	deleteContact: (mailboxId: string, id: string) =>
		del<void>(`/api/v1/mailboxes/${mailboxId}/contacts/${id}`),

	// Templates
	listTemplates: (mailboxId: string) =>
		get<EmailTemplate[]>(`/api/v1/mailboxes/${mailboxId}/templates`),
	createTemplate: (mailboxId: string, t: Omit<EmailTemplate, "id">) =>
		post<EmailTemplate>(`/api/v1/mailboxes/${mailboxId}/templates`, t),
	updateTemplate: (mailboxId: string, id: string, t: Omit<EmailTemplate, "id">) =>
		put<EmailTemplate>(`/api/v1/mailboxes/${mailboxId}/templates/${id}`, t),
	deleteTemplate: (mailboxId: string, id: string) =>
		del<void>(`/api/v1/mailboxes/${mailboxId}/templates/${id}`),

	// Action items
	listActionItems: (mailboxId: string, pendingOnly = true) =>
		get<ActionItem[]>(`/api/v1/mailboxes/${mailboxId}/action-items`, { params: { pending: String(pendingOnly) } }),
	completeActionItem: (mailboxId: string, itemId: string) =>
		request<void>(`/api/v1/mailboxes/${mailboxId}/action-items/${itemId}`, { method: "PATCH", body: JSON.stringify({ completed: true }) }),
	deleteActionItem: (mailboxId: string, itemId: string) =>
		del<void>(`/api/v1/mailboxes/${mailboxId}/action-items/${itemId}`),

	// Semantic search
	semanticSearch: (mailboxId: string, q: string, limit = 20) =>
		get<{ emails: Array<Email & { relevanceScore: number }> }>(
			`/api/v1/mailboxes/${mailboxId}/semantic-search`,
			{ params: { q, limit: String(limit) } },
		),

	// Contact intelligence
	getContactIntelligence: (mailboxId: string, contactEmail: string) =>
		get<ContactIntelligence>(`/api/v1/mailboxes/${mailboxId}/contacts/${encodeURIComponent(contactEmail)}/intelligence`),

	// Automation rules
	listRules: (mailboxId: string) =>
		get<AutomationRule[]>(`/api/v1/mailboxes/${mailboxId}/rules`),
	createRule: (mailboxId: string, rule: { name: string; conditions: RuleCondition[]; actions: RuleAction[]; priority?: number }) =>
		post<{ id: string }>(`/api/v1/mailboxes/${mailboxId}/rules`, rule),
	updateRule: (mailboxId: string, ruleId: string, updates: Partial<Omit<AutomationRule, "id" | "createdAt" | "updatedAt">>) =>
		put<{ id: string; updated: boolean }>(`/api/v1/mailboxes/${mailboxId}/rules/${ruleId}`, updates),
	deleteRule: (mailboxId: string, ruleId: string) =>
		del<void>(`/api/v1/mailboxes/${mailboxId}/rules/${ruleId}`),
	reorderRules: (mailboxId: string, ids: string[]) =>
		put<{ reordered: boolean }>(`/api/v1/mailboxes/${mailboxId}/rules/reorder`, { ids }),

	// WooCommerce
	testWooCommerce: (mailboxId: string, settings: { storeUrl: string; consumerKey: string; consumerSecret: string }) =>
		post<{ success: boolean; error?: string }>(`/api/v1/mailboxes/${mailboxId}/woocommerce/test`, settings),
	getWooOrders: (mailboxId: string, email: string, refresh = false) =>
		get<{ orders: WooCommerceOrder[] }>(`/api/v1/mailboxes/${mailboxId}/woocommerce/orders`, {
			params: refresh ? { email, refresh: "1" } : { email },
		}),

	// Knowledge Base
	listKbArticles: (mailboxId: string) =>
		get<KbArticle[]>(`/api/v1/mailboxes/${mailboxId}/knowledge`),
	createKbArticle: (mailboxId: string, data: KbArticleInput) =>
		post<{ id: string }>(`/api/v1/mailboxes/${mailboxId}/knowledge`, data),
	getKbArticle: (mailboxId: string, articleId: string) =>
		get<KbArticle>(`/api/v1/mailboxes/${mailboxId}/knowledge/${articleId}`),
	updateKbArticle: (mailboxId: string, articleId: string, data: KbArticleInput) =>
		put<KbArticle>(`/api/v1/mailboxes/${mailboxId}/knowledge/${articleId}`, data),
	deleteKbArticle: (mailboxId: string, articleId: string) =>
		del<void>(`/api/v1/mailboxes/${mailboxId}/knowledge/${articleId}`),
};

export default api;
