// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Vectorize helpers for email semantic search.
 *
 * Uses Cloudflare Vectorize with bge-base-en-v1.5 (768 dimensions).
 * Email vectors are namespaced as `{mailboxId}:{emailId}` so a single
 * index serves all mailboxes. All queries filter by mailboxId metadata.
 */

import { logger } from "./logger";

const BGE_MODEL = "@cf/baai/bge-base-en-v1.5" as const;
// BGE-base handles ~512 tokens; 2000 chars ≈ 400 tokens, safely within limit
const MAX_EMBED_CHARS = 2000;

/**
 * Embed a text string using BGE-base. Returns a 768-dimensional vector.
 * Returns null on failure (caller should fail-open).
 */
export async function embedText(ai: Ai, text: string): Promise<number[] | null> {
	const truncated = text.slice(0, MAX_EMBED_CHARS);
	try {
		const result = await (ai as any).run(BGE_MODEL, { text: [truncated] }) as { data: number[][] };
		return result.data[0] ?? null;
	} catch (e) {
		logger.error("vectorize", "embedText failed", { error: e });
		return null;
	}
}

/**
 * Upsert an email embedding into Vectorize.
 * ID format: `{mailboxId}:{emailId}` to namespace across mailboxes.
 */
export async function upsertEmailEmbedding(
	vectorize: VectorizeIndex,
	mailboxId: string,
	emailId: string,
	vector: number[],
	metadata: { folder: string; date: string },
): Promise<void> {
	await vectorize.upsert([{
		id: `${mailboxId}:${emailId}`,
		values: vector,
		metadata: { mailboxId, folder: metadata.folder, date: metadata.date },
	}]);
}

/**
 * Query Vectorize for emails semantically similar to a query string.
 * Returns `{ emailId, score }[]` sorted by relevance (highest first).
 */
export async function searchSimilarEmails(
	vectorize: VectorizeIndex,
	ai: Ai,
	query: string,
	mailboxId: string,
	topK = 50,
): Promise<Array<{ emailId: string; score: number }>> {
	const vector = await embedText(ai, query);
	if (!vector) return [];

	try {
		const result = await vectorize.query(vector, {
			topK,
			filter: { mailboxId },
			returnMetadata: "none",
		});

		return (result.matches ?? []).map((m) => ({
			// Strip the `{mailboxId}:` prefix to get the raw email ID
			emailId: (m.id as string).replace(`${mailboxId}:`, ""),
			score: m.score,
		}));
	} catch (e) {
		logger.error("vectorize", "searchSimilarEmails failed", { error: e });
		return [];
	}
}

/**
 * Delete a single email embedding from Vectorize.
 * Called when an email is permanently deleted.
 */
export async function deleteEmailEmbedding(
	vectorize: VectorizeIndex,
	mailboxId: string,
	emailId: string,
): Promise<void> {
	try {
		await vectorize.deleteByIds([`${mailboxId}:${emailId}`]);
	} catch (e) {
		logger.error("vectorize", "deleteEmailEmbedding failed", { error: e });
	}
}
