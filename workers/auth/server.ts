import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import { admin } from "better-auth/plugins";
import type { Env } from "../types";

export function createAuth(env: Env) {
	return betterAuth({
		database: drizzleAdapter(drizzle(env.AUTH_DB), { provider: "sqlite" }),
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL || "http://localhost:8787",
		trustedOrigins: [env.BETTER_AUTH_URL || "http://localhost:8787"],
		emailAndPassword: { enabled: true },
		session: {
			expiresIn: 60 * 60 * 24 * 7, // 7 days
			updateAge: 60 * 60 * 24, // refresh daily
			cookieCache: { enabled: false }, // workaround for bug #4203
		},
		plugins: [
			admin({
				defaultRole: "member",
			}),
		],
	});
}
