/**
 * KB article CRUD routes.
 *
 * All routes are mounted under `/api/v1/mailboxes/:mailboxId/knowledge`
 * and protected by the `requireMailbox` middleware applied in index.ts.
 *
 * R2 key: `knowledge/{mailboxId}/{articleId}.json`
 */

import { Hono } from "hono";
import type { MailboxContext } from "../lib/mailbox";
import { upsertKbArticle, deleteKbArticle } from "../lib/knowledge-vectorize";
import { logger } from "../lib/logger";

interface KbArticle {
	id: string;
	title: string;
	content: string;
	category: "brand" | "product" | "policy" | "faq";
	chunkCount: number;
	createdAt: string;
	updatedAt: string;
}

const VALID_CATEGORIES = new Set(["brand", "product", "policy", "faq"]);

const app = new Hono<MailboxContext>();

function r2Key(mailboxId: string, articleId: string) {
	return `knowledge/${mailboxId}/${articleId}.json`;
}

// GET / — list articles (id, title, category, updatedAt)
app.get("/", async (c) => {
	const mailboxId = c.req.param("mailboxId")!;
	try {
		const listed = await c.env.BUCKET.list({ prefix: `knowledge/${mailboxId}/` });
		const articles = await Promise.all(
			listed.objects.map(async (obj) => {
				const item = await c.env.BUCKET.get(obj.key);
				if (!item) return null;
				const a = await item.json<KbArticle>();
				return { id: a.id, title: a.title, category: a.category, chunkCount: a.chunkCount, updatedAt: a.updatedAt };
			}),
		);
		return c.json(articles.filter(Boolean));
	} catch (e) {
		logger.error("knowledge", "list articles failed", { error: e });
		return c.json({ error: "Failed to list articles" }, 500);
	}
});

// POST / — create article + embed
app.post("/", async (c) => {
	const mailboxId = c.req.param("mailboxId")!;
	const body = await c.req.json<{ title?: string; content?: string; category?: string }>();

	if (!body.title?.trim() || !body.content?.trim()) {
		return c.json({ error: "title and content are required" }, 400);
	}
	if (!VALID_CATEGORIES.has(body.category ?? "")) {
		return c.json({ error: "category must be one of: brand, product, policy, faq" }, 400);
	}

	const now = new Date().toISOString();
	const article: KbArticle = {
		id: crypto.randomUUID(),
		title: body.title.trim(),
		content: body.content.trim(),
		category: body.category as KbArticle["category"],
		chunkCount: 0,
		createdAt: now,
		updatedAt: now,
	};

	try {
		const chunkCount = await upsertKbArticle(
			c.env.KNOWLEDGE_VECTORIZE,
			c.env.AI,
			mailboxId,
			article,
		);
		article.chunkCount = chunkCount;

		await c.env.BUCKET.put(r2Key(mailboxId, article.id), JSON.stringify(article), {
			httpMetadata: { contentType: "application/json" },
		});

		return c.json({ id: article.id }, 201);
	} catch (e) {
		logger.error("knowledge", "create article failed", { error: e });
		return c.json({ error: "Failed to create article" }, 500);
	}
});

// GET /:articleId — full article
app.get("/:articleId", async (c) => {
	const mailboxId = c.req.param("mailboxId")!;
	const articleId = c.req.param("articleId")!;
	const obj = await c.env.BUCKET.get(r2Key(mailboxId, articleId));
	if (!obj) return c.json({ error: "Article not found" }, 404);
	return c.json(await obj.json<KbArticle>());
});

// PUT /:articleId — update content + re-embed
app.put("/:articleId", async (c) => {
	const mailboxId = c.req.param("mailboxId")!;
	const articleId = c.req.param("articleId")!;

	const existing = await c.env.BUCKET.get(r2Key(mailboxId, articleId));
	if (!existing) return c.json({ error: "Article not found" }, 404);

	const current = await existing.json<KbArticle>();
	const body = await c.req.json<{ title?: string; content?: string; category?: string }>();

	if (body.category !== undefined && !VALID_CATEGORIES.has(body.category)) {
		return c.json({ error: "category must be one of: brand, product, policy, faq" }, 400);
	}

	const updated: KbArticle = {
		...current,
		title: body.title?.trim() ?? current.title,
		content: body.content?.trim() ?? current.content,
		category: (body.category as KbArticle["category"]) ?? current.category,
		updatedAt: new Date().toISOString(),
	};

	try {
		// upsertKbArticle deletes old chunks when chunkCount > 0
		const chunkCount = await upsertKbArticle(
			c.env.KNOWLEDGE_VECTORIZE,
			c.env.AI,
			mailboxId,
			{ ...updated, chunkCount: current.chunkCount },
		);
		updated.chunkCount = chunkCount;

		await c.env.BUCKET.put(r2Key(mailboxId, updated.id), JSON.stringify(updated), {
			httpMetadata: { contentType: "application/json" },
		});

		return c.json(updated);
	} catch (e) {
		logger.error("knowledge", "update article failed", { error: e });
		return c.json({ error: "Failed to update article" }, 500);
	}
});

// DELETE /:articleId — remove R2 object + Vectorize vectors
app.delete("/:articleId", async (c) => {
	const mailboxId = c.req.param("mailboxId")!;
	const articleId = c.req.param("articleId")!;

	const obj = await c.env.BUCKET.get(r2Key(mailboxId, articleId));
	if (!obj) return c.json({ error: "Article not found" }, 404);

	const article = await obj.json<KbArticle>();

	try {
		await deleteKbArticle(c.env.KNOWLEDGE_VECTORIZE, mailboxId, articleId, article.chunkCount);
		await c.env.BUCKET.delete(r2Key(mailboxId, articleId));
		return new Response(null, { status: 204 });
	} catch (e) {
		logger.error("knowledge", "delete article failed", { error: e });
		return c.json({ error: "Failed to delete article" }, 500);
	}
});

export default app;
