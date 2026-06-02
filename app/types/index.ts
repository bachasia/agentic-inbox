// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export interface SignatureSettings {
	enabled: boolean;
	text: string;
	html?: string;
}

export interface TelegramSettings {
	enabled: boolean;
	botToken: string;
	chatId: string;
}

export interface DiscordSettings {
	enabled: boolean;
	webhookUrl: string;
}

export interface NotificationSettings {
	telegram?: TelegramSettings;
	discord?: DiscordSettings;
}

export interface Label {
	id: string;
	name: string;
	color: string;
}

export interface Contact {
	id: string;
	email: string;
	name?: string;
	frequency: number;
	last_seen: string;
}

export interface EmailTemplate {
	id: string;
	name: string;
	subject: string;
	body: string;
}

export interface ActionItem {
	id: string;
	emailId: string;
	description: string;
	dueDate?: string | null;
	completedAt?: string | null;
	createdAt: string;
}

export interface MailboxSettings {
	fromName?: string;
	forwarding?: { enabled: boolean; email: string };
	signature?: SignatureSettings;
	autoReply?: { enabled: boolean; subject: string; message: string };
	agentSystemPrompt?: string;
	notifications?: NotificationSettings;
	templates?: EmailTemplate[];
	unansweredDays?: number;
	digestEnabled?: boolean;
	digestTime?: string;
}

export interface Mailbox {
	id: string;
	email: string;
	name: string;
	settings?: MailboxSettings;
}

export interface Email {
	id: string;
	thread_id?: string | null;
	folder_id?: string | null;
	subject: string;
	sender: string;
	recipient: string;
	cc?: string;
	bcc?: string;
	date: string;
	read: boolean;
	starred: boolean;
	body?: string | null;
	in_reply_to?: string | null;
	email_references?: string | null;
	message_id?: string | null;
	raw_headers?: string | null;
	attachments?: Attachment[];
	snippet?: string | null;
	snooze_until?: string | null;
	scheduled_send_at?: string | null;
	labels?: Label[];
	// Thread aggregate fields (only present in threaded list view)
	thread_count?: number;
	thread_unread_count?: number;
	participants?: string;
	needs_reply?: boolean;
	has_draft?: boolean;
	// AI triage fields
	triage_category?: string | null;
	triage_priority?: number | null;
	triage_summary?: string | null;
	triage_confidence?: number | null;
}

export interface Attachment {
	id: string;
	filename: string;
	mimetype: string;
	size: number;
	content_id?: string;
	disposition?: string;
}

export interface Folder {
	id: string;
	name: string;
	unreadCount: number;
}
