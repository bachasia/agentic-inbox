import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import type { EmailTemplate } from "~/types";
import { queryKeys } from "./keys";

export function useTemplates(mailboxId?: string) {
	return useQuery<EmailTemplate[]>({
		queryKey: mailboxId ? queryKeys.templates.list(mailboxId) : ["templates", "_disabled"],
		queryFn: () => api.listTemplates(mailboxId!),
		enabled: !!mailboxId,
	});
}

export function useCreateTemplate(mailboxId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (t: Omit<EmailTemplate, "id">) => api.createTemplate(mailboxId, t),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.templates.list(mailboxId) }),
	});
}

export function useUpdateTemplate(mailboxId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, ...t }: EmailTemplate) => api.updateTemplate(mailboxId, id, t),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.templates.list(mailboxId) }),
	});
}

export function useDeleteTemplate(mailboxId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => api.deleteTemplate(mailboxId, id),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.templates.list(mailboxId) }),
	});
}
