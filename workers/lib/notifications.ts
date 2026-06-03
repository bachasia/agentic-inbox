// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { logger } from "./logger";

export interface EmailNotificationMeta {
	sender: string;
	senderName?: string;
	subject: string;
	mailboxId: string;
}

interface TelegramConfig {
	botToken: string;
	chatId: string;
}

interface DiscordConfig {
	webhookUrl: string;
}

interface NotificationsConfig {
	telegram?: { enabled?: boolean; botToken?: string; chatId?: string };
	discord?: { enabled?: boolean; webhookUrl?: string };
}

/** Escape HTML entities to prevent injection in Telegram HTML messages. */
function escapeHtmlEntities(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

async function sendTelegramNotification(cfg: TelegramConfig, meta: EmailNotificationMeta): Promise<void> {
	const sender = meta.senderName
		? `${escapeHtmlEntities(meta.senderName)} &lt;${escapeHtmlEntities(meta.sender)}&gt;`
		: escapeHtmlEntities(meta.sender);
	const text = `📬 <b>New email</b>\n<b>From:</b> ${sender}\n<b>Subject:</b> ${escapeHtmlEntities(meta.subject)}\n<b>Mailbox:</b> ${escapeHtmlEntities(meta.mailboxId)}`;

	const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ chat_id: cfg.chatId, text, parse_mode: "HTML" }),
	});
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(`Telegram API error ${res.status}: ${body}`);
	}
}

async function sendDiscordNotification(cfg: DiscordConfig, meta: EmailNotificationMeta): Promise<void> {
	const res = await fetch(cfg.webhookUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			embeds: [{
				title: meta.subject || "(no subject)",
				color: 0x3B82F6,
				fields: [
					{ name: "From", value: meta.senderName ? `${meta.senderName} <${meta.sender}>` : meta.sender, inline: true },
					{ name: "Mailbox", value: meta.mailboxId, inline: true },
				],
			}],
		}),
	});
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(`Discord webhook error ${res.status}: ${body}`);
	}
}

/** Fire notifications for all enabled providers in parallel. Never throws. */
export async function notifyNewEmail(
	notifications: NotificationsConfig | undefined,
	meta: EmailNotificationMeta,
): Promise<void> {
	if (!notifications) return;

	const tasks: Promise<void>[] = [];

	const tg = notifications.telegram;
	if (tg?.enabled && tg.botToken && tg.chatId) {
		tasks.push(
			sendTelegramNotification({ botToken: tg.botToken, chatId: tg.chatId }, meta)
				.catch((e: Error) => logger.error("notifications", "Telegram notification failed", { error: e })),
		);
	}

	const dc = notifications.discord;
	if (dc?.enabled && dc.webhookUrl) {
		tasks.push(
			sendDiscordNotification({ webhookUrl: dc.webhookUrl }, meta)
				.catch((e: Error) => {
					logger.error("notifications", "Discord notification failed", { error: e });
				}),
		);
	}

	await Promise.allSettled(tasks);
}

export interface UnansweredReminderMeta {
	subject: string;
	recipient: string;
	daysSent: number;
	mailboxId: string;
	emailId: string;
}

/** Send an unanswered-email reminder via all configured notification channels. Never throws. */
export async function sendReminderNotification(
	notifications: NotificationsConfig | undefined,
	meta: UnansweredReminderMeta,
): Promise<void> {
	if (!notifications) return;
	const text = `⏰ No reply yet\n\nSubject: ${meta.subject}\nTo: ${meta.recipient}\nSent: ${meta.daysSent} day(s) ago\nMailbox: ${meta.mailboxId}`;

	const tasks: Promise<void>[] = [];
	const tg = notifications.telegram;
	if (tg?.enabled && tg.botToken && tg.chatId) {
		tasks.push(
			fetch(`https://api.telegram.org/bot${tg.botToken}/sendMessage`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ chat_id: tg.chatId, text }),
			}).then(async (r) => {
				if (!r.ok) throw new Error(`Telegram ${r.status}`);
			}).catch((e: Error) => logger.error("notifications", "Reminder Telegram failed", { error: e })),
		);
	}
	const dc = notifications.discord;
	if (dc?.enabled && dc.webhookUrl) {
		tasks.push(
			fetch(dc.webhookUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content: text }),
			}).then(async (r) => {
				if (!r.ok) throw new Error(`Discord ${r.status}`);
			}).catch((e: Error) => logger.error("notifications", "Reminder Discord failed", { error: e })),
		);
	}
	await Promise.allSettled(tasks);
}

export interface DigestData {
	newEmailsCount: number;
	topEmails: Array<{ id: string; subject: string; sender: string; triage_priority: number }>;
	pendingActions: Array<{ description: string; dueDate?: string | null }>;
	overdueActions: Array<{ description: string; due_date: string }>;
	followUps: Array<{ subject: string; recipient: string; date: string }>;
}

/** Send the daily digest via all configured notification channels. Never throws. */
export async function sendDigestNotification(
	notifications: NotificationsConfig | undefined,
	data: DigestData,
	summary: string,
): Promise<void> {
	if (!notifications) return;

	const dateStr = new Date().toISOString().slice(0, 10);
	const lines: string[] = [`🌅 Morning Digest — ${dateStr}`, ""];

	lines.push(`📬 ${data.newEmailsCount} new email(s)`);
	if (data.topEmails.length) {
		for (const e of data.topEmails) {
			lines.push(`  • [P${e.triage_priority}] ${e.subject} from ${e.sender}`);
		}
	}
	lines.push("");

	const overdueCount = data.overdueActions.length;
	lines.push(`✅ Action items (${data.pendingActions.length} pending${overdueCount ? `, ${overdueCount} overdue` : ""}):`);
	for (const a of data.pendingActions) {
		const due = a.dueDate ? ` [due: ${a.dueDate}]` : "";
		lines.push(`  • ${a.description}${due}`);
	}
	lines.push("");

	if (data.followUps.length) {
		lines.push(`⏰ Awaiting replies (${data.followUps.length}):`);
		for (const f of data.followUps) {
			lines.push(`  • ${f.subject} → ${f.recipient}`);
		}
		lines.push("");
	}

	if (summary) lines.push(summary);

	const text = lines.join("\n");

	const tasks: Promise<void>[] = [];
	const tg = notifications.telegram;
	if (tg?.enabled && tg.botToken && tg.chatId) {
		tasks.push(
			fetch(`https://api.telegram.org/bot${tg.botToken}/sendMessage`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ chat_id: tg.chatId, text }),
			}).then(async (r) => {
				if (!r.ok) throw new Error(`Telegram ${r.status}`);
			}).catch((e: Error) => logger.error("notifications", "Digest Telegram failed", { error: e })),
		);
	}
	const dc = notifications.discord;
	if (dc?.enabled && dc.webhookUrl) {
		tasks.push(
			fetch(dc.webhookUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content: text }),
			}).then(async (r) => {
				if (!r.ok) throw new Error(`Discord ${r.status}`);
			}).catch((e: Error) => logger.error("notifications", "Digest Discord failed", { error: e })),
		);
	}
	if (!tasks.length) {
		console.log("Daily digest compiled but no notification channels configured.");
	}
	await Promise.allSettled(tasks);
}

/** Test a notification provider using settings provided directly (not from R2). */
export async function testNotification(
	provider: "telegram" | "discord",
	settings: Record<string, string>,
): Promise<{ success: boolean; error?: string }> {
	const testMeta: EmailNotificationMeta = {
		sender: "test@example.com",
		senderName: "Test Sender",
		subject: "Test notification from Agentic Inbox",
		mailboxId: "test",
	};

	try {
		if (provider === "telegram") {
			const { botToken, chatId } = settings;
			if (!botToken || !chatId) return { success: false, error: "botToken and chatId are required" };
			await sendTelegramNotification({ botToken, chatId }, testMeta);
		} else if (provider === "discord") {
			const { webhookUrl } = settings;
			if (!webhookUrl) return { success: false, error: "webhookUrl is required" };
			await sendDiscordNotification({ webhookUrl }, testMeta);
		} else {
			return { success: false, error: `Unknown provider: ${provider}` };
		}
		return { success: true };
	} catch (e) {
		return { success: false, error: (e as Error).message };
	}
}
