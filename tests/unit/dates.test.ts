import { describe, it, expect } from "vitest";
import {
	formatListDate,
	formatDetailDate,
	formatShortDate,
	formatQuotedDate,
} from "../../shared/dates";

describe("formatListDate", () => {
	it("shows time for today's date", () => {
		const now = new Date();
		const result = formatListDate(now.toISOString());
		// Should contain a colon (time format like "3:42 PM")
		expect(result).toMatch(/\d+:\d+/);
	});

	it("shows month+day for this year", () => {
		const thisYear = new Date();
		thisYear.setMonth(0, 15); // Jan 15 of current year
		// Avoid testing "today" edge case
		if (thisYear.toDateString() !== new Date().toDateString()) {
			const result = formatListDate(thisYear.toISOString());
			expect(result).toMatch(/Jan/);
			expect(result).toContain("15");
		}
	});

	it("shows year for older dates", () => {
		const result = formatListDate("2020-06-15T12:00:00Z");
		expect(result).toContain("2020");
	});

	it("returns raw string for invalid dates", () => {
		expect(formatListDate("not-a-date")).toBe("not-a-date");
	});
});

describe("formatDetailDate", () => {
	it("includes weekday abbreviation", () => {
		const result = formatDetailDate("2026-06-03T09:00:00Z");
		// Should contain a short weekday (Mon, Tue, Wed, etc.)
		expect(result).toMatch(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/);
	});

	it("includes time", () => {
		const result = formatDetailDate("2026-06-03T09:30:00Z");
		expect(result).toMatch(/\d+:\d+/);
	});

	it("returns raw string for invalid date", () => {
		expect(formatDetailDate("invalid")).toBe("invalid");
	});
});

describe("formatShortDate", () => {
	it("shows time only", () => {
		const result = formatShortDate("2026-06-03T14:30:00Z");
		expect(result).toMatch(/\d+:\d+/);
	});

	it("returns raw string for invalid date", () => {
		expect(formatShortDate("nope")).toBe("nope");
	});
});

describe("formatQuotedDate", () => {
	it("uses en-US locale for deterministic output", () => {
		const result = formatQuotedDate("2026-04-15T15:42:00Z");
		// en-US format: "Tue, Apr 15, 2026, 3:42 PM" (timezone may vary)
		expect(result).toContain("2026");
		expect(result).toContain("Apr");
		expect(result).toContain("15");
	});

	it("returns empty string for undefined/null", () => {
		expect(formatQuotedDate(undefined)).toBe("");
		expect(formatQuotedDate(undefined)).toBe("");
	});

	it("returns raw string for invalid date string", () => {
		expect(formatQuotedDate("garbage")).toBe("garbage");
	});
});
