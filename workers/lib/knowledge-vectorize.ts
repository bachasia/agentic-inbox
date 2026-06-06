/**
 * Knowledge Base Vectorize helpers.
 *
 * Chunks KB articles, embeds them with BGE-base-en-v1.5, and manages
 * vectors in the dedicated `knowledge-base` Vectorize index.
 *
 * Vector ID format: `{mailboxId}:{articleId}:{chunkIndex}`
 * Chunk content is NOT stored in Vectorize metadata (64-byte limit);
 * it is reconstructed from R2 on retrieval.
 */

import { embedText } from "./vectorize";
import { logger } from "./logger";

const MIN_CHUNK_CHARS = 50;
const MAX_CHUNK_CHARS = 2000;

export interface KbChunk {
	content: string;
	title: string;
	category: string;
	score: number;
}

/**
 * Split text into chunks at paragraph boundaries.
 * Falls back to single-newline splits for paragraphs that exceed maxChars.
 * Discards chunks shorter than MIN_CHUNK_CHARS.
 */
export function chunkText(text: string, maxChars = MAX_CHUNK_CHARS): string[] {
	const paragraphs = text.split(/\n\n+/);
	const chunks: string[] = [];

	for (const para of paragraphs) {
		const trimmed = para.trim();
		if (!trimmed) continue;

		if (trimmed.length <= maxChars) {
			if (trimmed.length >= MIN_CHUNK_CHARS) chunks.push(trimmed);
			continue;
		}

		// Paragraph too long — split on single newlines
		const lines = trimmed.split(/\n/);
		let current = "";
		for (const line of lines) {
			const candidate = current ? `${current}\n${line}` : line;
			if (candidate.length > maxChars) {
				if (current.length >= MIN_CHUNK_CHARS) chunks.push(current.trim());
				current = line;
			} else {
				current = candidate;
			}
		}
		if (current.trim().length >= MIN_CHUNK_CHARS) chunks.push(current.trim());
	}

	return chunks;
}

/**
 * Embed all chunks of a KB article and upsert them into Vectorize.
 * Deletes existing vectors for this article first (on update).
 */
export async function upsertKbArticle(
	vectorize: VectorizeIndex,
	ai: Ai,
	mailboxId: string,
	article: { id: string; title: string; content: string; category: string; chunkCount?: number },
): Promise<number> {
	// Delete old vectors if this is an update
	if (article.chunkCount && article.chunkCount > 0) {
		await deleteKbArticle(vectorize, mailboxId, article.id, article.chunkCount);
	}

	const chunks = chunkText(article.content);
	if (chunks.length === 0) return 0;

	const vectors = [];
	for (let i = 0; i < chunks.length; i++) {
		const embedding = await embedText(ai, `${article.title}\n${chunks[i]}`);
		if (!embedding) {
			logger.warn("knowledge", "Failed to embed chunk, skipping", { articleId: article.id, chunkIndex: i });
			continue;
		}
		vectors.push({
			id: `${mailboxId}:${article.id}:${i}`,
			values: embedding,
			metadata: {
				mailboxId,
				articleId: article.id,
				title: article.title,
				category: article.category,
				chunkIndex: i,
				type: "kb",
			},
		});
	}

	if (vectors.length > 0) {
		await vectorize.upsert(vectors);
	}

	return chunks.length;
}

/**
 * Delete all Vectorize vectors for a KB article by chunk IDs.
 */
export async function deleteKbArticle(
	vectorize: VectorizeIndex,
	mailboxId: string,
	articleId: string,
	chunkCount: number,
): Promise<void> {
	try {
		const ids = Array.from({ length: chunkCount }, (_, i) => `${mailboxId}:${articleId}:${i}`);
		await vectorize.deleteByIds(ids);
	} catch (e) {
		logger.error("knowledge", "deleteKbArticle failed", { error: e, articleId });
	}
}

/**
 * Search KB chunks relevant to a query for a specific mailbox.
 * Returns up to topK chunks with their content fetched from R2.
 */
export async function searchKbChunks(
	vectorize: VectorizeIndex,
	ai: Ai,
	bucket: R2Bucket,
	query: string,
	mailboxId: string,
	topK = 3,
): Promise<KbChunk[]> {
	const embedding = await embedText(ai, query);
	if (!embedding) return [];

	try {
		const result = await vectorize.query(embedding, {
			topK,
			filter: { mailboxId, type: "kb" },
			returnMetadata: "all",
		});

		const matches = result.matches ?? [];
		const chunks: KbChunk[] = [];

		for (const match of matches) {
			const meta = match.metadata as {
				mailboxId: string;
				articleId: string;
				title: string;
				category: string;
				chunkIndex: number;
			} | undefined;

			if (!meta) continue;

			// Load full article from R2 and extract the chunk
			const obj = await bucket.get(`knowledge/${mailboxId}/${meta.articleId}.json`);
			if (!obj) continue;

			const article = await obj.json<{ content: string }>();
			const chunks_text = chunkText(article.content);
			const chunkContent = chunks_text[meta.chunkIndex] ?? "";

			if (chunkContent) {
				chunks.push({
					content: chunkContent,
					title: meta.title,
					category: meta.category,
					score: match.score,
				});
			}
		}

		return chunks;
	} catch (e) {
		logger.error("knowledge", "searchKbChunks failed", { error: e });
		return [];
	}
}
