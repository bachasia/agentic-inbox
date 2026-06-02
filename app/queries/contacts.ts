import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import type { Contact } from "~/types";
import { queryKeys } from "./keys";

export function useContacts(mailboxId?: string, query?: string) {
	return useQuery<Contact[]>({
		queryKey: mailboxId ? queryKeys.contacts.list(mailboxId, query) : ["contacts", "_disabled"],
		queryFn: () => api.listContacts(mailboxId!, query ? { q: query } : undefined),
		enabled: !!mailboxId,
	});
}

export function useUpdateContact(mailboxId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, name }: { id: string; name: string }) =>
			api.updateContact(mailboxId, id, name),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["mailboxes", mailboxId, "contacts"] }),
	});
}

export function useDeleteContact(mailboxId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => api.deleteContact(mailboxId, id),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["mailboxes", mailboxId, "contacts"] }),
	});
}
