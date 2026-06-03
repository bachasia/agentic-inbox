import { zipSync, strToU8 } from "fflate";
import type { MailboxDO } from "../durableObject";
import type { EmailFull, AttachmentInfo } from "./schemas";
import { logger } from "./logger";

const BATCH_SIZE = 100;
const MAX_EMAILS = 5000;

function sanitizeFilename(subject: string | null | undefined, id: string, date: string | null | undefined): string {
	const datePrefix = date ? new Date(date).toISOString().slice(0, 10) : "unknown";
	const slug = (subject || "no-subject")
		.replace(/[^a-zA-Z0-9\s-]/g, "")
		.trim()
		.replace(/\s+/g, "-")
		.slice(0, 50)
		.toLowerCase();
	return `${datePrefix}_${slug}_${id.slice(0, 8)}.eml`;
}

function encodeBase64(data: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < data.length; i++) {
		binary += String.fromCharCode(data[i]);
	}
	return btoa(binary);
}

function buildEmlContent(
	email: EmailFull,
	attachmentBlobs: Map<string, { data: Uint8Array; info: AttachmentInfo }>,
): string {
	const boundary = `----=_Part_${email.id.replace(/-/g, "")}`;
	const hasAttachments = attachmentBlobs.size > 0;

	const headers = [
		`From: ${email.sender || "unknown"}`,
		`To: ${email.recipient || ""}`,
		email.cc ? `Cc: ${email.cc}` : null,
		`Subject: ${email.subject || "(no subject)"}`,
		`Date: ${email.date ? new Date(email.date).toUTCString() : new Date().toUTCString()}`,
		email.message_id ? `Message-ID: <${email.message_id}>` : null,
		email.in_reply_to ? `In-Reply-To: <${email.in_reply_to}>` : null,
		`MIME-Version: 1.0`,
	].filter(Boolean);

	if (!hasAttachments) {
		headers.push(`Content-Type: text/html; charset=utf-8`);
		headers.push(`Content-Transfer-Encoding: quoted-printable`);
		return headers.join("\r\n") + "\r\n\r\n" + (email.body || "");
	}

	headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
	const parts: string[] = [headers.join("\r\n"), ""];

	parts.push(`--${boundary}`);
	parts.push(`Content-Type: text/html; charset=utf-8`);
	parts.push(`Content-Transfer-Encoding: quoted-printable`);
	parts.push("");
	parts.push(email.body || "");

	for (const [, { data, info }] of attachmentBlobs) {
		const encoded = encodeBase64(data);
		const lines: string[] = [];
		for (let i = 0; i < encoded.length; i += 76) {
			lines.push(encoded.slice(i, i + 76));
		}
		parts.push(`--${boundary}`);
		parts.push(`Content-Type: ${info.mimetype}; name="${info.filename}"`);
		parts.push(`Content-Disposition: attachment; filename="${info.filename}"`);
		parts.push(`Content-Transfer-Encoding: base64`);
		parts.push("");
		parts.push(lines.join("\r\n"));
	}

	parts.push(`--${boundary}--`);
	return parts.join("\r\n");
}

export async function exportMailboxToZip(
	stub: DurableObjectStub<MailboxDO>,
	bucket: R2Bucket,
	options?: { folder?: string },
): Promise<Uint8Array> {
	const files: Record<string, Uint8Array> = {};
	let page = 1;
	let totalFetched = 0;

	while (totalFetched < MAX_EMAILS) {
		const emails = await stub.getEmails({
			folder: options?.folder,
			page,
			limit: BATCH_SIZE,
		} as any) as EmailFull[];

		if (!emails || emails.length === 0) break;

		for (const email of emails) {
			const attachmentBlobs = new Map<string, { data: Uint8Array; info: AttachmentInfo }>();

			if (email.attachments?.length) {
				const fetches = email.attachments.map(async (att) => {
					try {
						const key = `attachments/${email.id}/${att.id}/${att.filename}`;
						const obj = await bucket.get(key);
						if (obj) {
							const data = new Uint8Array(await obj.arrayBuffer());
							attachmentBlobs.set(att.id, { data, info: att });
						}
					} catch (e) {
						logger.error("export", "Failed to fetch attachment", {
							error: e,
							meta: { emailId: email.id, attachmentId: att.id },
						});
					}
				});
				await Promise.all(fetches);
			}

			const emlContent = buildEmlContent(email, attachmentBlobs);
			const filename = sanitizeFilename(email.subject, email.id, email.date);
			files[filename] = strToU8(emlContent);
		}

		totalFetched += emails.length;
		if (emails.length < BATCH_SIZE) break;
		page++;
	}

	return zipSync(files, { level: 6 });
}
