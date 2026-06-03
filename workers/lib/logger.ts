type LogLevel = "debug" | "info" | "warn" | "error";
type Component =
	| "email-receive" | "email-send" | "triage" | "agent"
	| "api" | "notifications" | "rules" | "vectorize"
	| "contacts" | "export";

interface LogOptions {
	error?: unknown;
	meta?: Record<string, unknown>;
}

function formatEntry(level: LogLevel, component: Component, msg: string, opts?: LogOptions) {
	const entry: Record<string, unknown> = {
		ts: new Date().toISOString(),
		level,
		component,
		msg,
	};
	if (opts?.error) {
		const e = opts.error instanceof Error ? opts.error : new Error(String(opts.error));
		entry.error = { name: e.name, message: e.message, stack: e.stack };
	}
	if (opts?.meta) entry.meta = opts.meta;
	return JSON.stringify(entry);
}

function makeLogFn(level: LogLevel) {
	return (component: Component, msg: string, opts?: LogOptions) => {
		console[level](formatEntry(level, component, msg, opts));
	};
}

export const logger = {
	debug: makeLogFn("debug"),
	info: makeLogFn("info"),
	warn: makeLogFn("warn"),
	error: makeLogFn("error"),
};
