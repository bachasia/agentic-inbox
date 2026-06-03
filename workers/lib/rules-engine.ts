// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Pure evaluation logic for the automation rules engine.
 * No I/O — all functions are synchronous and side-effect-free.
 */

export interface RuleCondition {
	field: "from" | "to" | "subject" | "body" | "category" | "priority";
	operator: "contains" | "equals" | "starts_with" | "ends_with" | "greater_than" | "less_than";
	value: string;
}

export interface RuleAction {
	type: "label" | "move" | "archive" | "mark_read" | "notify" | "webhook";
	params?: Record<string, string>;
}

export interface AutomationRule {
	id: string;
	name: string;
	enabled: boolean;
	priority: number;
	conditions: RuleCondition[];
	actions: RuleAction[];
	createdAt: string;
	updatedAt: string;
}

interface EvaluatableEmail {
	sender?: string | null;
	recipient?: string | null;
	subject?: string | null;
	body?: string | null;
	triage_category?: string | null;
	triage_priority?: number | null;
}

function getFieldValue(email: EvaluatableEmail, field: RuleCondition["field"]): string {
	switch (field) {
		case "from":     return (email.sender ?? "").toLowerCase();
		case "to":       return (email.recipient ?? "").toLowerCase();
		case "subject":  return (email.subject ?? "").toLowerCase();
		case "body":     return (email.body ?? "").toLowerCase();
		case "category": return (email.triage_category ?? "").toLowerCase();
		case "priority": return String(email.triage_priority ?? 0);
		default:         return "";
	}
}

export function matchesCondition(email: EvaluatableEmail, condition: RuleCondition): boolean {
	const fieldVal = getFieldValue(email, condition.field);
	const condVal = condition.value.toLowerCase();

	switch (condition.operator) {
		case "contains":    return fieldVal.includes(condVal);
		case "equals":      return fieldVal === condVal;
		case "starts_with": return fieldVal.startsWith(condVal);
		case "ends_with":   return fieldVal.endsWith(condVal);
		case "greater_than":
			return Number(fieldVal) > Number(condVal);
		case "less_than":
			return Number(fieldVal) < Number(condVal);
	}
}

/** Returns the rule's actions if ALL conditions match, else empty array. */
export function evaluateRule(email: EvaluatableEmail, rule: AutomationRule): RuleAction[] {
	if (!rule.enabled) return [];
	if (rule.conditions.length === 0) return [];
	const allMatch = rule.conditions.every((c) => matchesCondition(email, c));
	return allMatch ? rule.actions : [];
}

/**
 * Evaluate all enabled rules in priority order.
 * Returns deduplicated actions (e.g. won't label with same labelId twice).
 */
export function evaluateAllRules(email: EvaluatableEmail, rules: AutomationRule[]): RuleAction[] {
	const sorted = [...rules].sort((a, b) => a.priority - b.priority);
	const allActions: RuleAction[] = [];
	const seenLabels = new Set<string>();
	const seenTypes = new Set<string>();

	for (const rule of sorted) {
		const actions = evaluateRule(email, rule);
		for (const action of actions) {
			// Deduplicate: only one archive, mark_read per evaluation pass
			if (action.type === "archive" || action.type === "mark_read") {
				if (seenTypes.has(action.type)) continue;
				seenTypes.add(action.type);
			}
			// Deduplicate labels by labelId
			if (action.type === "label" && action.params?.labelId) {
				if (seenLabels.has(action.params.labelId)) continue;
				seenLabels.add(action.params.labelId);
			}
			allActions.push(action);
		}
	}

	return allActions;
}

/** Validate a webhook URL: must be HTTPS, no private/internal IPs. */
export function isValidWebhookUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "https:") return false;
		const host = parsed.hostname;
		// Block loopback, link-local, private ranges
		if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") return false;
		if (/^10\./.test(host)) return false;
		if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
		if (/^192\.168\./.test(host)) return false;
		if (/^169\.254\./.test(host)) return false;
		return true;
	} catch {
		return false;
	}
}
