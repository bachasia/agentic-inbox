// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export interface Env extends Cloudflare.Env {
	AUTH_DB: D1Database;
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
	MCP_API_KEY?: string;
}
