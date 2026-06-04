import { routeAgentRequest } from "agents";
import { Hono } from "hono";
import { createRequestHandler } from "react-router";
import { app as apiApp, receiveEmail } from "./index";
import { createAuth } from "./auth/server";
import { requireAuth } from "./auth/middleware";
import { logger } from "./lib/logger";
import { EmailMCP } from "./mcp";
import type { Env } from "./types";

export { MailboxDO } from "./durableObject";
export { EmailAgent } from "./agent";
export { EmailMCP } from "./mcp";

declare module "react-router" {
	export interface AppLoadContext {
		cloudflare: {
			env: Env;
			ctx: ExecutionContext;
		};
	}
}

const requestHandler = createRequestHandler(
	() => import("virtual:react-router/server-build"),
	import.meta.env.MODE,
);

// Main app that wraps the API and adds React Router fallback
const app = new Hono<{ Bindings: Env }>();

// Better Auth handler — must be before session middleware
app.on(["POST", "GET"], "/api/auth/*", async (c) => {
	const auth = createAuth(c.env);
	return auth.handler(c.req.raw);
});

// Public: check if any users exist (needed on /setup before auth)
app.get("/api/v1/auth/setup-status", async (c) => {
	const result = await c.env.AUTH_DB.prepare("SELECT COUNT(*) as count FROM user").first<{ count: number }>();
	return c.json({ needsSetup: (result?.count ?? 0) === 0 });
});

// Public: create first admin account (only works when 0 users exist)
app.post("/api/v1/auth/setup", async (c) => {
	const count = await c.env.AUTH_DB.prepare("SELECT COUNT(*) as count FROM user").first<{ count: number }>();
	if ((count?.count ?? 0) > 0) return c.json({ error: "Setup already complete" }, 409);

	const { email, password, name } = await c.req.json() as { email: string; password: string; name: string };
	if (!email || !password || !name) return c.json({ error: "email, password, and name are required" }, 400);

	const auth = createAuth(c.env);
	const signUpResponse = await auth.api.signUpEmail({
		body: { email, password, name },
		headers: c.req.raw.headers,
		asResponse: true,
	});

	if (!signUpResponse.ok) return signUpResponse;

	// Clone response to read user id without consuming the original (which carries session cookies)
	const cloned = signUpResponse.clone();
	const userData = await cloned.json() as { user: { id: string } };
	await c.env.AUTH_DB.prepare(`UPDATE "user" SET role = 'admin' WHERE id = ?`).bind(userData.user.id).run();

	return signUpResponse;
});

// MCP server endpoint — optional API key auth
const mcpHandler = EmailMCP.serve("/mcp", { binding: "EMAIL_MCP" });
app.all("/mcp", async (c) => {
	if (!import.meta.env.DEV && c.env.MCP_API_KEY) {
		const authHeader = c.req.header("Authorization");
		if (authHeader !== `Bearer ${c.env.MCP_API_KEY}`) {
			return c.text("Unauthorized", 401);
		}
	}
	return mcpHandler.fetch(c.req.raw, c.env, c.executionCtx as ExecutionContext);
});
app.all("/mcp/*", async (c) => {
	if (!import.meta.env.DEV && c.env.MCP_API_KEY) {
		const authHeader = c.req.header("Authorization");
		if (authHeader !== `Bearer ${c.env.MCP_API_KEY}`) {
			return c.text("Unauthorized", 401);
		}
	}
	return mcpHandler.fetch(c.req.raw, c.env, c.executionCtx as ExecutionContext);
});

// Agent WebSocket — requires valid session
app.all("/agents/*", async (c) => {
	if (!import.meta.env.DEV) {
		const auth = createAuth(c.env);
		const session = await auth.api.getSession({ headers: c.req.raw.headers });
		if (!session) return c.text("Unauthorized", 401);
	}
	const response = await routeAgentRequest(c.req.raw, c.env);
	if (response) return response;
	return c.text("Agent not found", 404);
});

// Session middleware for all /api/v1/* routes
app.use("/api/v1/*", requireAuth);

// Mount the API routes
app.route("/", apiApp);

// Static assets have content-hashed filenames — safe to cache in browser forever
app.use("/assets/*", async (c, next) => {
	await next();
	c.res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
});

// React Router catch-all: serves the SPA for all non-API routes
app.all("*", (c) => {
	return requestHandler(c.req.raw, {
		cloudflare: { env: c.env, ctx: c.executionCtx as ExecutionContext },
	});
});

// Export the Hono app as the default export with an email handler
export default {
	fetch: app.fetch,
	async email(
		event: { raw: ReadableStream; rawSize: number },
		env: Env,
		ctx: ExecutionContext,
	) {
		try {
			await receiveEmail(event, env, ctx);
		} catch (e) {
			logger.error("email-receive", "Failed to process incoming email", { error: e });
			// Re-throw so Cloudflare's email routing can retry delivery or bounce the message.
			throw e;
		}
	},
};
