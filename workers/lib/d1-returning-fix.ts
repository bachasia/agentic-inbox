/**
 * Drizzle ORM's D1 driver uses stmt.run() for all mutations, but D1's run()
 * discards RETURNING clause results. This proxy intercepts stmt.run() on
 * statements that contain RETURNING and redirects to stmt.all(), which
 * actually returns the rows.
 */
function proxyStmt(stmt: D1PreparedStatement, label = "stmt"): D1PreparedStatement {
	return new Proxy(stmt, {
		get(target, prop) {
			if (typeof prop === "string") {
				console.log(`[d1-patch] stmt.${prop} accessed on ${label}`);
			}
			if (prop === "run") {
				return async () => {
					try {
						console.log(`[d1-patch] ${label} calling all()...`);
						const result = await (target as any).all();
						console.log(`[d1-patch] all() success, rows: ${result?.results?.length}`);
						return result;
					} catch (e: any) {
						console.log(`[d1-patch] all() THREW: ${e?.message ?? e}`);
						throw e;
					}
				};
			}
			if (prop === "bind") {
				return (...args: unknown[]) => {
					console.log(`[d1-patch] ${label}.bind() CALLED with ${args.length} args`);
					try {
						const boundStmt = (target.bind as Function)(...args);
						console.log(`[d1-patch] target.bind() succeeded, type: ${typeof boundStmt}, constructor: ${boundStmt?.constructor?.name}`);
						const wrapped = proxyStmt(boundStmt, "bound-stmt");
						console.log(`[d1-patch] returning wrapped bound-stmt`);
						return wrapped;
					} catch (e: any) {
						console.log(`[d1-patch] target.bind() THREW: ${e?.message ?? e}`);
						throw e;
					}
				};
			}
			const val = (target as any)[prop];
			return typeof val === "function" ? val.bind(target) : val;
		},
	});
}

/**
 * Drizzle ORM's D1 driver uses stmt.run() for all mutations, but D1's run()
 * discards RETURNING clause results. This proxy intercepts stmt.run() on
 * statements that contain RETURNING and redirects to stmt.all(), which
 * actually returns the rows.
 */
export function patchD1ForReturning(db: D1Database): D1Database {
	return new Proxy(db, {
		get(target, prop) {
			if (prop === "prepare") {
				return (query: string) => {
					const stmt = target.prepare(query);
					const hasReturning = /\breturning\b/i.test(query);
					if (hasReturning) console.log("[d1-patch] RETURNING query intercepted:", query.slice(0, 60));
					return hasReturning ? proxyStmt(stmt) : stmt;
				};
			}
			// Log all other D1 method accesses to find what Drizzle calls
			if (typeof prop === "string" && prop !== "then" && prop !== "catch") {
				const val = (target as any)[prop];
				if (typeof val === "function") {
					console.log("[d1-patch] db." + prop + "() called");
				}
			}
			const val = (target as any)[prop];
			return typeof val === "function" ? val.bind(target) : val;
		},
	});
}
