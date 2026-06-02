// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import api from "~/services/api";
import type { ActionItem } from "~/types";

export function useActionItems(mailboxId: string | undefined, pendingOnly = true) {
	return useQuery<ActionItem[]>({
		queryKey: queryKeys.actionItems.list(mailboxId ?? ""),
		queryFn: async () => {
			const res = await api.get(`/api/v1/mailboxes/${mailboxId}/action-items?pending=${pendingOnly}`);
			return res.data as ActionItem[];
		},
		enabled: !!mailboxId,
	});
}

export function useCompleteActionItem(mailboxId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (itemId: string) => {
			await api.patch(`/api/v1/mailboxes/${mailboxId}/action-items/${itemId}`, { completed: true });
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.actionItems.list(mailboxId) });
		},
	});
}

export function useDeleteActionItem(mailboxId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (itemId: string) => {
			await api.delete(`/api/v1/mailboxes/${mailboxId}/action-items/${itemId}`);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.actionItems.list(mailboxId) });
		},
	});
}
