import type { Env } from "../types";

export async function getUserMailboxIds(env: Env, userId: string): Promise<string[]> {
	const result = await env.AUTH_DB.prepare(
		"SELECT mailboxId FROM mailbox_permission WHERE userId = ?"
	).bind(userId).all<{ mailboxId: string }>();
	return result.results.map((r) => r.mailboxId);
}

export async function hasMailboxAccess(env: Env, userId: string, mailboxId: string): Promise<boolean> {
	const result = await env.AUTH_DB.prepare(
		"SELECT 1 FROM mailbox_permission WHERE userId = ? AND mailboxId = ?"
	).bind(userId, mailboxId).first();
	return !!result;
}

export async function assignMailbox(env: Env, userId: string, mailboxId: string): Promise<void> {
	await env.AUTH_DB.prepare(
		"INSERT OR IGNORE INTO mailbox_permission (id, userId, mailboxId) VALUES (?, ?, ?)"
	).bind(crypto.randomUUID(), userId, mailboxId).run();
}

export async function revokeMailbox(env: Env, userId: string, mailboxId: string): Promise<void> {
	await env.AUTH_DB.prepare(
		"DELETE FROM mailbox_permission WHERE userId = ? AND mailboxId = ?"
	).bind(userId, mailboxId).run();
}

export async function revokeAllUserMailboxes(env: Env, userId: string): Promise<void> {
	await env.AUTH_DB.prepare(
		"DELETE FROM mailbox_permission WHERE userId = ?"
	).bind(userId).run();
}

export async function setUserMailboxes(env: Env, userId: string, mailboxIds: string[]): Promise<void> {
	await revokeAllUserMailboxes(env, userId);
	for (const mailboxId of mailboxIds) {
		await assignMailbox(env, userId, mailboxId);
	}
}
