import { ApiError } from "./api";

export interface AdminUser {
	id: string;
	name: string;
	email: string;
	role: string;
	createdAt: string;
	mailboxCount: number;
}

export interface CreateUserPayload {
	email: string;
	password: string;
	name: string;
	mailboxIds?: string[];
}

async function req<T>(url: string, options: RequestInit = {}): Promise<T> {
	const res = await fetch(url, {
		...options,
		headers: { "Content-Type": "application/json", ...(options.headers as Record<string, string>) },
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new ApiError(res.status, body as Record<string, unknown>);
	}
	if (res.status === 204) return undefined as T;
	return res.json() as Promise<T>;
}

const adminApi = {
	listUsers: (params?: { search?: string; limit?: number; offset?: number }) => {
		const qs = params?.search ? `?search=${encodeURIComponent(params.search)}` : "";
		return req<{ users: AdminUser[]; total: number }>(`/api/v1/admin/users${qs}`);
	},

	createUser: (data: CreateUserPayload) =>
		req<{ user: AdminUser; mailboxIds: string[] }>("/api/v1/admin/users", {
			method: "POST",
			body: JSON.stringify(data),
		}),

	updateUserRole: (userId: string, role: string) =>
		req<{ userId: string; role: string }>(`/api/v1/admin/users/${userId}`, {
			method: "PUT",
			body: JSON.stringify({ role }),
		}),

	removeUser: (userId: string) =>
		req<void>(`/api/v1/admin/users/${userId}`, { method: "DELETE" }),

	getUserMailboxes: (userId: string) =>
		req<{ mailboxIds: string[] }>(`/api/v1/admin/users/${userId}/mailboxes`),

	setUserMailboxes: (userId: string, mailboxIds: string[]) =>
		req<{ userId: string; mailboxIds: string[] }>(`/api/v1/admin/users/${userId}/mailboxes`, {
			method: "PUT",
			body: JSON.stringify({ mailboxIds }),
		}),
};

export default adminApi;
