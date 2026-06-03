import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import adminApi, { type CreateUserPayload, type UpdateCredentialsPayload } from "~/services/admin-api";

export const adminQueryKeys = {
	users: (search?: string) => ["admin", "users", search] as const,
	userMailboxes: (userId: string) => ["admin", "users", userId, "mailboxes"] as const,
};

export function useAdminUsers(search?: string) {
	return useQuery({
		queryKey: adminQueryKeys.users(search),
		queryFn: () => adminApi.listUsers({ search }),
	});
}

export function useUserMailboxes(userId: string) {
	return useQuery({
		queryKey: adminQueryKeys.userMailboxes(userId),
		queryFn: () => adminApi.getUserMailboxes(userId),
		enabled: !!userId,
	});
}

export function useCreateUser() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (data: CreateUserPayload) => adminApi.createUser(data),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
	});
}

export function useUpdateUserRole() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ userId, role }: { userId: string; role: string }) =>
			adminApi.updateUserRole(userId, role),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
	});
}

export function useRemoveUser() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (userId: string) => adminApi.removeUser(userId),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
	});
}

export function useUpdateUserCredentials() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ userId, data }: { userId: string; data: UpdateCredentialsPayload }) =>
			adminApi.updateUserCredentials(userId, data),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
	});
}

export function useSetUserMailboxes() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ userId, mailboxIds }: { userId: string; mailboxIds: string[] }) =>
			adminApi.setUserMailboxes(userId, mailboxIds),
		onSuccess: (_, { userId }) => {
			qc.invalidateQueries({ queryKey: adminQueryKeys.userMailboxes(userId) });
		},
	});
}
