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
	topicId?: string;
}

export interface DiscordSettings {
	enabled: boolean;
	webhookUrl: string;
}

export interface NotificationSettings {
	telegram?: TelegramSettings;
	discord?: DiscordSettings;
}

export interface GlobalStoreNotifConfig {
	enabled: boolean;
	topicId?: string;
}

export interface GlobalNotificationSettings {
	telegram?: {
		botToken: string;
		chatId: string;
		stores?: Record<string, GlobalStoreNotifConfig>;
	};
	discord?: {
		webhookUrl: string;
		stores?: Record<string, GlobalStoreNotifConfig>;
	};
}

export interface GlobalSettings {
	notifications?: GlobalNotificationSettings;
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

export interface WooCommerceSettings {
	enabled: boolean;
	storeUrl: string;
	consumerKey: string;
	consumerSecret: string;
}

export interface WooCommerceTracking {
	trackingNumber: string;
	trackingProvider: string;
	customTrackingProvider?: string;
	customTrackingLink?: string;
	dateShipped?: string;
}

export interface WooCommerceLineItem {
	name: string;
	quantity: number;
	total: string;
}

export interface WooCommerceOrder {
	id: number;
	number: string;
	status: string;
	total: string;
	currency: string;
	dateCreated: string;
	paymentMethodTitle: string;
	shippingMethod?: string;
	lineItems: WooCommerceLineItem[];
	tracking: WooCommerceTracking[];
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
	woocommerce?: WooCommerceSettings;
}

export interface MailboxSummary {
	inboxUnreadCount: number;
	latestEmail: {
		sender: string | null;
		subject: string | null;
		date: string | null;
	} | null;
}

export interface MailboxStatus {
	forwardingEnabled: boolean;
	autoReplyEnabled: boolean;
}

export interface Mailbox {
	id: string;
	email: string;
	name: string;
	settings?: MailboxSettings;
	summary?: MailboxSummary;
	status?: MailboxStatus;
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

export interface ContactIntelligence {
	totalEmails: number;
	emailsSent: number;
	emailsReceived: number;
	firstContact: string | null;
	lastContact: string | null;
	avgResponseTimeHours: number | null;
	topTopics: string[];
	relationshipScore: number;
	computedAt: string;
}

export interface RuleCondition {
	field: "from" | "to" | "subject" | "body" | "category" | "priority";
	operator: "contains" | "equals" | "starts_with" | "ends_with" | "greater_than" | "less_than";
	value: string;
}

export interface RuleAction {
	type: "label" | "move" | "archive" | "mark_read" | "notify" | "webhook";
	params?: Record<string, string>;
}

export interface AutomationRule {
	id: string;
	name: string;
	enabled: boolean;
	priority: number;
	conditions: RuleCondition[];
	actions: RuleAction[];
	createdAt: string;
	updatedAt: string;
}
