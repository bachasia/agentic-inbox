import { createMiddleware } from "hono/factory";
import { createAuth } from "./server";
import type { Env } from "../types";

export type AuthUser = {
	id: string;
	email: string;
	role: string;
	name: string;
};

export type AuthVariables = {
	Variables: { user: AuthUser };
};

// Validates session cookie and injects user into context. Dev mode bypasses auth.
export const requireAuth = createMiddleware<{
	Bindings: Env;
	Variables: { user: AuthUser };
}>(async (c, next) => {
	if (import.meta.env.DEV) {
		c.set("user", { id: "dev", email: "dev@localhost", role: "admin", name: "Dev" });
		return next();
	}
	const auth = createAuth(c.env);
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) return c.json({ error: "Unauthorized" }, 401);
	c.set("user", {
		id: session.user.id,
		email: session.user.email,
		role: (session.user as any).role ?? "member",
		name: session.user.name,
	});
	await next();
});

// Admin-only guard — must be used after requireAuth
export const requireAdmin = createMiddleware<{
	Bindings: Env;
	Variables: { user: AuthUser };
}>(async (c, next) => {
	const user = c.get("user");
	if (user?.role !== "admin") return c.json({ error: "Forbidden" }, 403);
	await next();
});
