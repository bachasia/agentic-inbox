import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import type { Label } from "~/types";
import { queryKeys } from "./keys";

export function useLabels(mailboxId?: string) {
	return useQuery<Label[]>({
		queryKey: mailboxId ? queryKeys.labels.list(mailboxId) : ["labels", "_disabled"],
		queryFn: () => api.listLabels(mailboxId!),
		enabled: !!mailboxId,
	});
}

export function useCreateLabel(mailboxId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ name, color }: { name: string; color: string }) =>
			api.createLabel(mailboxId, name, color),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.labels.list(mailboxId) }),
	});
}

export function useUpdateLabel(mailboxId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, name, color }: { id: string; name: string; color: string }) =>
			api.updateLabel(mailboxId, id, name, color),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.labels.list(mailboxId) }),
	});
}

export function useDeleteLabel(mailboxId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => api.deleteLabel(mailboxId, id),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.labels.list(mailboxId) });
			qc.invalidateQueries({ queryKey: ["emails", mailboxId] });
		},
	});
}

export function useApplyLabel(mailboxId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ emailId, labelId }: { emailId: string; labelId: string }) =>
			api.applyLabel(mailboxId, emailId, labelId),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["emails", mailboxId] });
		},
	});
}

export function useRemoveLabel(mailboxId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ emailId, labelId }: { emailId: string; labelId: string }) =>
			api.removeLabel(mailboxId, emailId, labelId),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["emails", mailboxId] });
		},
	});
}
