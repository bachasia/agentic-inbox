import { describe, it, expect } from "vitest";
import {
	matchesCondition,
	evaluateRule,
	evaluateAllRules,
	isValidWebhookUrl,
	type AutomationRule,
	type RuleCondition,
	type RuleAction,
} from "../../workers/lib/rules-engine";

const email = {
	sender: "alice@example.com",
	recipient: "bob@example.com",
	subject: "Urgent: Budget proposal",
	body: "Please review the attached budget document",
	triage_category: "business",
	triage_priority: 3,
};

describe("matchesCondition", () => {
	it("contains — matches substring", () => {
		expect(matchesCondition(email, { field: "from", operator: "contains", value: "alice" })).toBe(true);
	});

	it("contains — no match", () => {
		expect(matchesCondition(email, { field: "from", operator: "contains", value: "charlie" })).toBe(false);
	});

	it("equals — exact match (case-insensitive)", () => {
		expect(matchesCondition(email, { field: "from", operator: "equals", value: "Alice@Example.com" })).toBe(true);
	});

	it("equals — no match", () => {
		expect(matchesCondition(email, { field: "from", operator: "equals", value: "alice" })).toBe(false);
	});

	it("starts_with", () => {
		expect(matchesCondition(email, { field: "subject", operator: "starts_with", value: "urgent" })).toBe(true);
	});

	it("ends_with", () => {
		expect(matchesCondition(email, { field: "subject", operator: "ends_with", value: "proposal" })).toBe(true);
	});

	it("greater_than — numeric comparison on priority", () => {
		expect(matchesCondition(email, { field: "priority", operator: "greater_than", value: "2" })).toBe(true);
		expect(matchesCondition(email, { field: "priority", operator: "greater_than", value: "3" })).toBe(false);
	});

	it("less_than — numeric comparison on priority", () => {
		expect(matchesCondition(email, { field: "priority", operator: "less_than", value: "4" })).toBe(true);
		expect(matchesCondition(email, { field: "priority", operator: "less_than", value: "3" })).toBe(false);
	});

	it("category field", () => {
		expect(matchesCondition(email, { field: "category", operator: "equals", value: "business" })).toBe(true);
	});

	it("body field", () => {
		expect(matchesCondition(email, { field: "body", operator: "contains", value: "budget" })).toBe(true);
	});

	it("to field", () => {
		expect(matchesCondition(email, { field: "to", operator: "equals", value: "bob@example.com" })).toBe(true);
	});

	it("handles null/undefined fields gracefully", () => {
		const sparse = { sender: null, subject: undefined } as any;
		expect(matchesCondition(sparse, { field: "from", operator: "contains", value: "x" })).toBe(false);
		expect(matchesCondition(sparse, { field: "subject", operator: "equals", value: "" })).toBe(true);
	});
});

function makeRule(overrides: Partial<AutomationRule> = {}): AutomationRule {
	return {
		id: "r1",
		name: "Test Rule",
		enabled: true,
		priority: 1,
		conditions: [{ field: "from", operator: "contains", value: "alice" }],
		actions: [{ type: "archive" }],
		createdAt: "2026-01-01",
		updatedAt: "2026-01-01",
		...overrides,
	};
}

describe("evaluateRule", () => {
	it("returns actions when all conditions match", () => {
		const actions = evaluateRule(email, makeRule());
		expect(actions).toEqual([{ type: "archive" }]);
	});

	it("returns empty when disabled", () => {
		expect(evaluateRule(email, makeRule({ enabled: false }))).toEqual([]);
	});

	it("returns empty when conditions list is empty", () => {
		expect(evaluateRule(email, makeRule({ conditions: [] }))).toEqual([]);
	});

	it("returns empty when any condition fails (AND logic)", () => {
		const rule = makeRule({
			conditions: [
				{ field: "from", operator: "contains", value: "alice" },
				{ field: "subject", operator: "contains", value: "nonexistent" },
			],
		});
		expect(evaluateRule(email, rule)).toEqual([]);
	});

	it("returns actions when all conditions match (multiple)", () => {
		const rule = makeRule({
			conditions: [
				{ field: "from", operator: "contains", value: "alice" },
				{ field: "subject", operator: "contains", value: "budget" },
			],
			actions: [{ type: "label", params: { labelId: "important" } }],
		});
		expect(evaluateRule(email, rule)).toEqual([{ type: "label", params: { labelId: "important" } }]);
	});
});

describe("evaluateAllRules", () => {
	it("sorts rules by priority", () => {
		const lowPrio = makeRule({ id: "low", priority: 10, actions: [{ type: "mark_read" }] });
		const highPrio = makeRule({ id: "high", priority: 1, actions: [{ type: "archive" }] });
		const result = evaluateAllRules(email, [lowPrio, highPrio]);
		expect(result[0].type).toBe("archive");
		expect(result[1].type).toBe("mark_read");
	});

	it("deduplicates archive actions", () => {
		const r1 = makeRule({ id: "r1", priority: 1, actions: [{ type: "archive" }] });
		const r2 = makeRule({ id: "r2", priority: 2, actions: [{ type: "archive" }] });
		const result = evaluateAllRules(email, [r1, r2]);
		expect(result.filter((a) => a.type === "archive")).toHaveLength(1);
	});

	it("deduplicates mark_read actions", () => {
		const r1 = makeRule({ id: "r1", priority: 1, actions: [{ type: "mark_read" }] });
		const r2 = makeRule({ id: "r2", priority: 2, actions: [{ type: "mark_read" }] });
		const result = evaluateAllRules(email, [r1, r2]);
		expect(result.filter((a) => a.type === "mark_read")).toHaveLength(1);
	});

	it("deduplicates labels by labelId", () => {
		const r1 = makeRule({ id: "r1", priority: 1, actions: [{ type: "label", params: { labelId: "a" } }] });
		const r2 = makeRule({ id: "r2", priority: 2, actions: [{ type: "label", params: { labelId: "a" } }] });
		const result = evaluateAllRules(email, [r1, r2]);
		expect(result.filter((a) => a.type === "label")).toHaveLength(1);
	});

	it("allows different labels", () => {
		const r1 = makeRule({ id: "r1", priority: 1, actions: [{ type: "label", params: { labelId: "a" } }] });
		const r2 = makeRule({ id: "r2", priority: 2, actions: [{ type: "label", params: { labelId: "b" } }] });
		const result = evaluateAllRules(email, [r1, r2]);
		expect(result.filter((a) => a.type === "label")).toHaveLength(2);
	});

	it("does not deduplicate notify or webhook", () => {
		const r1 = makeRule({ id: "r1", priority: 1, actions: [{ type: "notify" }] });
		const r2 = makeRule({ id: "r2", priority: 2, actions: [{ type: "notify" }] });
		const result = evaluateAllRules(email, [r1, r2]);
		expect(result.filter((a) => a.type === "notify")).toHaveLength(2);
	});

	it("skips disabled rules", () => {
		const enabled = makeRule({ id: "e", enabled: true, actions: [{ type: "archive" }] });
		const disabled = makeRule({ id: "d", enabled: false, actions: [{ type: "mark_read" }] });
		const result = evaluateAllRules(email, [enabled, disabled]);
		expect(result).toEqual([{ type: "archive" }]);
	});

	it("returns empty for no matching rules", () => {
		const rule = makeRule({ conditions: [{ field: "from", operator: "equals", value: "nobody@example.com" }] });
		expect(evaluateAllRules(email, [rule])).toEqual([]);
	});
});

describe("isValidWebhookUrl", () => {
	it("accepts valid HTTPS URLs", () => {
		expect(isValidWebhookUrl("https://hooks.slack.com/services/abc")).toBe(true);
		expect(isValidWebhookUrl("https://example.com/webhook")).toBe(true);
	});

	it("rejects HTTP URLs", () => {
		expect(isValidWebhookUrl("http://example.com/webhook")).toBe(false);
	});

	it("rejects localhost", () => {
		expect(isValidWebhookUrl("https://localhost/hook")).toBe(false);
		expect(isValidWebhookUrl("https://127.0.0.1/hook")).toBe(false);
		expect(isValidWebhookUrl("https://[::1]/hook")).toBe(false);
	});

	it("rejects private IPs", () => {
		expect(isValidWebhookUrl("https://10.0.0.1/hook")).toBe(false);
		expect(isValidWebhookUrl("https://172.16.0.1/hook")).toBe(false);
		expect(isValidWebhookUrl("https://172.31.255.1/hook")).toBe(false);
		expect(isValidWebhookUrl("https://192.168.1.1/hook")).toBe(false);
	});

	it("rejects link-local addresses", () => {
		expect(isValidWebhookUrl("https://169.254.1.1/hook")).toBe(false);
	});

	it("rejects malformed URLs", () => {
		expect(isValidWebhookUrl("not-a-url")).toBe(false);
		expect(isValidWebhookUrl("")).toBe(false);
	});
});
