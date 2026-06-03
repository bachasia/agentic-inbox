import { Hono } from "hono";
import { createAuth } from "../auth/server";
import { getUserMailboxIds, setUserMailboxes, revokeAllUserMailboxes } from "../auth/permissions";
import { listMailboxes } from "../lib/email-helpers";
import type { Env } from "../types";
import type { AuthUser } from "../auth/middleware";

type AdminContext = {
	Bindings: Env;
	Variables: { user: AuthUser };
};

const app = new Hono<AdminContext>();

// List users with optional search and pagination
app.get("/users", async (c) => {
	const auth = createAuth(c.env);
	const searchParam = c.req.query("search");
	const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
	const offset = Number(c.req.query("offset") ?? 0);

	const response = await auth.api.listUsers({
		query: { limit, offset, searchValue: searchParam, searchField: "email" },
		headers: c.req.raw.headers,
	});
	const data = response as unknown as { users: any[]; total: number };

	// Enrich with mailbox counts
	const users = await Promise.all(
		(data.users ?? []).map(async (u: any) => {
			const mailboxIds = await getUserMailboxIds(c.env, u.id);
			return { ...u, mailboxCount: mailboxIds.length };
		}),
	);

	return c.json({ users, total: data.total ?? users.length });
});

// Create a member account directly (admin sets email + password)
app.post("/users", async (c) => {
	const { email, password, name, mailboxIds = [] } = await c.req.json() as {
		email: string;
		password: string;
		name: string;
		mailboxIds?: string[];
	};

	if (!email || !password || !name) {
		return c.json({ error: "email, password, and name are required" }, 400);
	}
	if (password.length < 8) {
		return c.json({ error: "Password must be at least 8 characters" }, 400);
	}

	const auth = createAuth(c.env);
	const created = await auth.api.createUser({
		body: { email, password, name, role: "member" },
		headers: c.req.raw.headers,
	});

	if (!created) return c.json({ error: "Failed to create user" }, 500);

	const userId = (created as any).id ?? (created as any).user?.id;
	if (mailboxIds.length > 0 && userId) {
		await setUserMailboxes(c.env, userId, mailboxIds);
	}

	return c.json({ user: created, mailboxIds }, 201);
});

// Update user role — prevents demoting the last admin
app.put("/users/:userId", async (c) => {
	const { userId } = c.req.param();
	const { role } = await c.req.json() as { role: string };

	if (role !== "admin" && role !== "member") {
		return c.json({ error: "role must be admin or member" }, 400);
	}

	if (role === "member") {
		// Prevent demoting the last admin
		const result = await c.env.AUTH_DB.prepare(
			`SELECT COUNT(*) as count FROM "user" WHERE role = 'admin'`
		).first<{ count: number }>();
		if ((result?.count ?? 0) <= 1) {
			return c.json({ error: "Cannot demote the last admin" }, 409);
		}
	}

	const auth = createAuth(c.env);
	await auth.api.setRole({
		body: { userId, role },
		headers: c.req.raw.headers,
	});

	return c.json({ userId, role });
});

// Update user credentials (name, email, password) — admin only
app.put("/users/:userId/credentials", async (c) => {
	const { userId } = c.req.param();
	const body = await c.req.json() as { name?: string; email?: string; password?: string };

	if (!body.name && !body.email && !body.password) {
		return c.json({ error: "At least one field required" }, 400);
	}
	if (body.password !== undefined && body.password.length < 8) {
		return c.json({ error: "Password must be at least 8 characters" }, 400);
	}

	const auth = createAuth(c.env);

	if (body.name !== undefined || body.email !== undefined) {
		if (body.email) {
			const existing = await c.env.AUTH_DB.prepare(
				`SELECT id FROM "user" WHERE email = ? AND id != ?`
			).bind(body.email, userId).first();
			if (existing) return c.json({ error: "Email already in use" }, 409);
		}
		await auth.api.adminUpdateUser({
			body: {
				userId,
				data: {
					...(body.name !== undefined && { name: body.name }),
					...(body.email !== undefined && { email: body.email }),
				},
			},
			headers: c.req.raw.headers,
		});
	}

	if (body.password) {
		await auth.api.setUserPassword({
			body: { userId, newPassword: body.password },
			headers: c.req.raw.headers,
		});
	}

	return c.json({ success: true });
});

// Delete user — prevents self-deletion and deleting the last admin
app.delete("/users/:userId", async (c) => {
	const { userId } = c.req.param();
	const currentUser = c.get("user");

	if (userId === currentUser.id) {
		return c.json({ error: "Cannot delete your own account" }, 409);
	}

	const target = await c.env.AUTH_DB.prepare(
		`SELECT role FROM "user" WHERE id = ?`
	).bind(userId).first<{ role: string }>();

	if (target?.role === "admin") {
		const result = await c.env.AUTH_DB.prepare(
			`SELECT COUNT(*) as count FROM "user" WHERE role = 'admin'`
		).first<{ count: number }>();
		if ((result?.count ?? 0) <= 1) {
			return c.json({ error: "Cannot delete the last admin" }, 409);
		}
	}

	await revokeAllUserMailboxes(c.env, userId);

	const auth = createAuth(c.env);
	await auth.api.removeUser({
		body: { userId },
		headers: c.req.raw.headers,
	});

	return c.body(null, 204);
});

// Get mailbox assignments for a user
app.get("/users/:userId/mailboxes", async (c) => {
	const { userId } = c.req.param();
	const mailboxIds = await getUserMailboxIds(c.env, userId);
	return c.json({ mailboxIds });
});

// Replace mailbox assignments for a user
app.put("/users/:userId/mailboxes", async (c) => {
	const { userId } = c.req.param();
	const { mailboxIds } = await c.req.json() as { mailboxIds: string[] };

	if (!Array.isArray(mailboxIds)) {
		return c.json({ error: "mailboxIds must be an array" }, 400);
	}

	// Validate mailboxIds exist in R2
	const allMailboxes = await listMailboxes(c.env.BUCKET);
	const validIds = new Set(allMailboxes.map((m) => m.id));
	const invalid = mailboxIds.filter((id) => !validIds.has(id));
	if (invalid.length > 0) {
		return c.json({ error: `Unknown mailboxIds: ${invalid.join(", ")}` }, 400);
	}

	await setUserMailboxes(c.env, userId, mailboxIds);
	return c.json({ userId, mailboxIds });
});

export { app as adminRoutes };
