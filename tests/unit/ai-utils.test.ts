import { describe, it, expect } from "vitest";
import { normalizeDueDate } from "../../workers/lib/ai";

describe("normalizeDueDate", () => {
	it("passes through ISO date (YYYY-MM-DD)", () => {
		expect(normalizeDueDate("2026-06-15")).toBe("2026-06-15");
	});

	it("converts parseable date strings to ISO", () => {
		const result = normalizeDueDate("2026-06-15T12:00:00Z");
		expect(result).toBe("2026-06-15");
	});

	it("converts ISO datetime to date-only", () => {
		expect(normalizeDueDate("2026-06-15T10:30:00Z")).toBe("2026-06-15");
	});

	it("returns null for null/undefined", () => {
		expect(normalizeDueDate(null)).toBeNull();
		expect(normalizeDueDate(undefined)).toBeNull();
	});

	it("returns null for unparseable strings", () => {
		expect(normalizeDueDate("not a date")).toBeNull();
		expect(normalizeDueDate("asdf")).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(normalizeDueDate("")).toBeNull();
	});
});
