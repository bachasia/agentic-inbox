import { describe, it, expect } from "vitest";
import { parseSearchQuery, isNaturalLanguage } from "../../app/lib/search-parser";

describe("parseSearchQuery", () => {
	it("parses from: operator", () => {
		const result = parseSearchQuery("from:alice@example.com");
		expect(result.from).toBe("alice@example.com");
		expect(result.query).toBe("");
	});

	it("parses to: operator", () => {
		const result = parseSearchQuery("to:bob@test.com");
		expect(result.to).toBe("bob@test.com");
	});

	it("parses subject: operator", () => {
		const result = parseSearchQuery("subject:hello");
		expect(result.subject).toBe("hello");
	});

	it("parses in: operator (folder)", () => {
		const result = parseSearchQuery("in:sent");
		expect(result.folder).toBe("sent");
	});

	it("parses is:unread", () => {
		const result = parseSearchQuery("is:unread");
		expect(result.is_read).toBe(false);
	});

	it("parses is:read", () => {
		const result = parseSearchQuery("is:read");
		expect(result.is_read).toBe(true);
	});

	it("parses is:starred", () => {
		const result = parseSearchQuery("is:starred");
		expect(result.is_starred).toBe(true);
	});

	it("parses is:unstarred", () => {
		const result = parseSearchQuery("is:unstarred");
		expect(result.is_starred).toBe(false);
	});

	it("parses has:attachment", () => {
		const result = parseSearchQuery("has:attachment");
		expect(result.has_attachment).toBe(true);
	});

	it("parses before: and after: dates", () => {
		const result = parseSearchQuery("after:2025-01-01 before:2025-12-31");
		expect(result.date_start).toBeDefined();
		expect(result.date_end).toBeDefined();
	});

	it("parses quoted values", () => {
		const result = parseSearchQuery('from:"John Doe"');
		expect(result.from).toBe("John Doe");
	});

	it("extracts free text after operators", () => {
		const result = parseSearchQuery("from:alice hello world");
		expect(result.from).toBe("alice");
		expect(result.query).toBe("hello world");
	});

	it("handles multiple operators", () => {
		const result = parseSearchQuery("from:alice to:bob is:unread budget");
		expect(result.from).toBe("alice");
		expect(result.to).toBe("bob");
		expect(result.is_read).toBe(false);
		expect(result.query).toBe("budget");
	});

	it("handles plain text with no operators", () => {
		const result = parseSearchQuery("hello world");
		expect(result.query).toBe("hello world");
		expect(result.from).toBeUndefined();
	});

	it("handles empty input", () => {
		const result = parseSearchQuery("");
		expect(result.query).toBe("");
	});

	it("handles invalid date gracefully", () => {
		const result = parseSearchQuery("before:not-a-date");
		expect(result.date_end).toBeUndefined();
	});
});

describe("isNaturalLanguage", () => {
	it("returns true for multi-word queries without operators", () => {
		expect(isNaturalLanguage("find the budget email")).toBe(true);
		expect(isNaturalLanguage("what did alice say about the project")).toBe(true);
	});

	it("returns false for single word", () => {
		expect(isNaturalLanguage("budget")).toBe(false);
	});

	it("returns false for queries with operators", () => {
		expect(isNaturalLanguage("from:alice budget discussion")).toBe(false);
		expect(isNaturalLanguage("is:unread important email")).toBe(false);
	});

	it("returns false for empty/whitespace", () => {
		expect(isNaturalLanguage("")).toBe(false);
		expect(isNaturalLanguage("  ")).toBe(false);
	});
});
