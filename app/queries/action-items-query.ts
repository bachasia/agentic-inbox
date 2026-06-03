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
		queryFn: () => api.listActionItems(mailboxId!, pendingOnly),
		enabled: !!mailboxId,
	});
}

export function useCompleteActionItem(mailboxId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (itemId: string) => api.completeActionItem(mailboxId, itemId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.actionItems.list(mailboxId) });
		},
	});
}

export function useDeleteActionItem(mailboxId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (itemId: string) => api.deleteActionItem(mailboxId, itemId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.actionItems.list(mailboxId) });
		},
	});
}
