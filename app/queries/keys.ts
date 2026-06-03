// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/** Centralised query key factories for cache invalidation. */
export const queryKeys = {
	mailboxes: {
		all: ["mailboxes"] as const,
		detail: (id: string) => ["mailboxes", id] as const,
	},
	emails: {
		list: (mailboxId: string, params: Record<string, string>) =>
			["emails", mailboxId, params] as const,
		detail: (mailboxId: string, emailId: string) =>
			["emails", mailboxId, emailId] as const,
		thread: (mailboxId: string, threadId: string) =>
			["emails", mailboxId, "thread", threadId] as const,
	},
	folders: {
		list: (mailboxId: string) => ["folders", mailboxId] as const,
	},
	search: {
		results: (mailboxId: string, query: string, page: number) =>
			["search", mailboxId, query, page] as const,
	},
	config: ["config"] as const,
	labels: {
		list: (mailboxId: string) => ["mailboxes", mailboxId, "labels"] as const,
	},
	contacts: {
		list: (mailboxId: string, q?: string) => ["mailboxes", mailboxId, "contacts", q ?? ""] as const,
	},
	templates: {
		list: (mailboxId: string) => ["mailboxes", mailboxId, "templates"] as const,
	},
	priorityInbox: {
		list: (mailboxId: string) => ["mailboxes", mailboxId, "priority-inbox"] as const,
	},
	actionItems: {
		list: (mailboxId: string) => ["mailboxes", mailboxId, "action-items"] as const,
	},
	contactIntelligence: {
		detail: (mailboxId: string, email: string) => ["mailboxes", mailboxId, "contact-intelligence", email] as const,
	},
	rules: {
		list: (mailboxId: string) => ["mailboxes", mailboxId, "rules"] as const,
	},
};
