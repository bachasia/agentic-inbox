// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import type { AutomationRule, RuleCondition, RuleAction } from "~/types";
import { queryKeys } from "./keys";

export function useRules(mailboxId?: string) {
	return useQuery<AutomationRule[]>({
		queryKey: mailboxId ? queryKeys.rules.list(mailboxId) : ["rules", "_disabled"],
		queryFn: () => api.listRules(mailboxId!),
		enabled: !!mailboxId,
	});
}

export function useCreateRule(mailboxId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (rule: { name: string; conditions: RuleCondition[]; actions: RuleAction[] }) =>
			api.createRule(mailboxId, rule),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.rules.list(mailboxId) }),
	});
}

export function useUpdateRule(mailboxId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, updates }: { id: string; updates: Partial<AutomationRule> }) =>
			api.updateRule(mailboxId, id, updates),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.rules.list(mailboxId) }),
	});
}

export function useDeleteRule(mailboxId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (ruleId: string) => api.deleteRule(mailboxId, ruleId),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.rules.list(mailboxId) }),
	});
}

export function useReorderRules(mailboxId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (ids: string[]) => api.reorderRules(mailboxId, ids),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.rules.list(mailboxId) }),
	});
}
