import {
	Button,
	Dialog,
	Input,
	Select,
	Text,
	useKumoToastManager,
} from "@cloudflare/kumo";
import { PencilIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { type FormEvent, useState } from "react";
import { Link as RouterLink } from "react-router";
import { useMailboxes } from "~/queries/mailboxes";
import {
	useAdminUsers,
	useCreateUser,
	useRemoveUser,
} from "~/queries/admin";
import type { AdminUser } from "~/services/admin-api";

function RoleBadge({ role }: { role: string }) {
	const isAdmin = role === "admin";
	return (
		<span
			className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium"
			style={isAdmin
				? { background: "rgba(79,70,229,0.08)", color: "var(--home-indigo)" }
				: { background: "var(--kumo-fill)", color: "var(--kumo-subtle)" }
			}
		>
			<span
				className="w-1.5 h-1.5 rounded-full shrink-0"
				style={{ background: isAdmin ? "var(--home-indigo)" : "var(--kumo-subtle)" }}
			/>
			{role}
		</span>
	);
}

export default function AdminIndexRoute() {
	const toastManager = useKumoToastManager();
	const [search, setSearch] = useState("");
	const { data, isLoading } = useAdminUsers(search || undefined);
	const { data: mailboxData = [] } = useMailboxes();
	const createUser = useCreateUser();
	const removeUser = useRemoveUser();

	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [createName, setCreateName] = useState("");
	const [createEmail, setCreateEmail] = useState("");
	const [createPassword, setCreatePassword] = useState("");
	const [createConfirm, setCreateConfirm] = useState("");
	const [selectedMailboxes, setSelectedMailboxes] = useState<string[]>([]);
	const [createError, setCreateError] = useState<string | null>(null);
	const [isCreating, setIsCreating] = useState(false);
	const [lastCreated, setLastCreated] = useState<{ email: string; password: string } | null>(null);

	const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);

	const resetCreateForm = () => {
		setCreateName("");
		setCreateEmail("");
		setCreatePassword("");
		setCreateConfirm("");
		setSelectedMailboxes([]);
		setCreateError(null);
		setLastCreated(null);
	};

	const handleCreate = async (e: FormEvent) => {
		e.preventDefault();
		setCreateError(null);
		if (createPassword !== createConfirm) {
			setCreateError("Passwords do not match");
			return;
		}
		if (createPassword.length < 8) {
			setCreateError("Password must be at least 8 characters");
			return;
		}
		setIsCreating(true);
		try {
			await createUser.mutateAsync({
				email: createEmail,
				password: createPassword,
				name: createName,
				mailboxIds: selectedMailboxes,
			});
			setLastCreated({ email: createEmail, password: createPassword });
			toastManager.add({ title: "Member created successfully" });
		} catch (err: unknown) {
			setCreateError(err instanceof Error ? err.message : "Failed to create user");
		} finally {
			setIsCreating(false);
		}
	};

	const handleDelete = async () => {
		if (!deleteTarget) return;
		setIsDeleting(true);
		try {
			await removeUser.mutateAsync(deleteTarget.id);
			toastManager.add({ title: "User removed" });
			setDeleteTarget(null);
		} catch (err: unknown) {
			toastManager.add({
				title: err instanceof Error ? err.message : "Failed to remove user",
				variant: "error",
			});
		} finally {
			setIsDeleting(false);
		}
	};

	const toggleMailbox = (id: string) => {
		setSelectedMailboxes((prev) =>
			prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
		);
	};

	const users = data?.users ?? [];

	return (
		<div>
			<div className="flex items-center justify-between mb-6">
				<h2 className="text-xl font-bold text-kumo-default">Team Members</h2>
				<Button
					variant="primary"
					size="sm"
					icon={<PlusIcon size={14} />}
					onClick={() => { resetCreateForm(); setIsCreateOpen(true); }}
				>
					Create Member
				</Button>
			</div>

			<div className="mb-4">
				<Input
					placeholder="Search by email…"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					size="sm"
					aria-label="Search users"
				/>
			</div>

			<div className="rounded-xl border border-kumo-line bg-kumo-base overflow-hidden">
				{isLoading ? (
					<div className="p-8 text-center text-sm text-kumo-subtle">Loading…</div>
				) : users.length === 0 ? (
					<div className="p-8 text-center text-sm text-kumo-subtle">No users found</div>
				) : (
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-kumo-line bg-kumo-tint">
								<th className="px-4 py-3 text-left text-xs font-semibold text-kumo-subtle uppercase tracking-wider">Name</th>
								<th className="px-4 py-3 text-left text-xs font-semibold text-kumo-subtle uppercase tracking-wider">Email</th>
								<th className="px-4 py-3 text-left text-xs font-semibold text-kumo-subtle uppercase tracking-wider">Role</th>
								<th className="px-4 py-3 text-left text-xs font-semibold text-kumo-subtle uppercase tracking-wider">Mailboxes</th>
								<th className="px-4 py-3" />
							</tr>
						</thead>
						<tbody>
							{users.map((user, i) => (
								<tr
									key={user.id}
									className="border-b border-kumo-line last:border-0 hover:bg-kumo-fill transition-colors"
								>
									<td className="px-4 py-3 font-medium text-kumo-default">{user.name}</td>
									<td className="px-4 py-3 text-kumo-subtle">{user.email}</td>
									<td className="px-4 py-3"><RoleBadge role={user.role} /></td>
									<td className="px-4 py-3 text-kumo-subtle">{user.mailboxCount}</td>
									<td className="px-4 py-3">
										<div className="flex items-center justify-end gap-1">
											<RouterLink to={`/admin/users/${user.id}`}>
												<Button variant="ghost" size="sm" shape="square" icon={<PencilIcon size={14} />} aria-label="Edit" />
											</RouterLink>
											<Button
												variant="ghost"
												size="sm"
												shape="square"
												icon={<TrashIcon size={14} />}
												aria-label="Delete"
												onClick={() => setDeleteTarget(user)}
											/>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>

			{/* Create Member Dialog */}
			<Dialog.Root open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) resetCreateForm(); }}>
				<Dialog size="sm" className="p-6">
					<Dialog.Title className="text-base font-semibold mb-5">
						{lastCreated ? "Member Created" : "Create Member"}
					</Dialog.Title>

					{lastCreated ? (
						<div className="space-y-4">
							<div className="rounded-lg border border-kumo-line bg-kumo-tint p-4 text-sm space-y-1">
								<p className="text-kumo-subtle">Share these credentials with the new member:</p>
								<p><span className="text-kumo-subtle">Email:</span> <strong className="text-kumo-default">{lastCreated.email}</strong></p>
								<p><span className="text-kumo-subtle">Password:</span> <strong className="text-kumo-default font-mono">{lastCreated.password}</strong></p>
							</div>
							<div className="flex justify-end gap-2">
								<Dialog.Close render={(props) => (
									<Button {...props} variant="primary" size="sm">Done</Button>
								)} />
							</div>
						</div>
					) : (
						<form onSubmit={handleCreate} className="space-y-4">
							{createError && <Text variant="error" size="sm">{createError}</Text>}
							<Input label="Name" value={createName} onChange={(e) => setCreateName(e.target.value)} required size="sm" />
							<Input label="Email" type="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} required size="sm" />
							<Input label="Password" type="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} required size="sm" placeholder="Min 8 characters" />
							<Input label="Confirm Password" type="password" value={createConfirm} onChange={(e) => setCreateConfirm(e.target.value)} required size="sm" />

							{mailboxData.length > 0 && (
								<div>
									<span className="text-sm font-medium text-kumo-default block mb-2">Assign Mailboxes</span>
									<div className="space-y-1 max-h-36 overflow-y-auto border border-kumo-line rounded-lg p-2">
										{mailboxData.map((m) => (
											<label key={m.id} className="flex items-center gap-2 cursor-pointer text-sm py-1 px-2 rounded hover:bg-kumo-tint">
												<input
													type="checkbox"
													checked={selectedMailboxes.includes(m.id)}
													onChange={() => toggleMailbox(m.id)}
													className="rounded"
												/>
												<span className="text-kumo-default">{m.name || m.email}</span>
											</label>
										))}
									</div>
								</div>
							)}

							<div className="flex justify-end gap-2 pt-2">
								<Dialog.Close render={(props) => (
									<Button {...props} variant="secondary" size="sm">Cancel</Button>
								)} />
								<Button type="submit" variant="primary" size="sm" loading={isCreating}>
									Create
								</Button>
							</div>
						</form>
					)}
				</Dialog>
			</Dialog.Root>

			{/* Delete Confirmation Dialog */}
			<Dialog.Root open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
				<Dialog size="sm" className="p-6">
					<Dialog.Title className="text-base font-semibold mb-2">Remove User</Dialog.Title>
					<Dialog.Description className="text-kumo-subtle text-sm mb-5">
						Remove <strong className="text-kumo-default">{deleteTarget?.email}</strong>? This will revoke all their mailbox access.
					</Dialog.Description>
					<div className="flex justify-end gap-2">
						<Dialog.Close render={(props) => (
							<Button {...props} variant="secondary" size="sm">Cancel</Button>
						)} />
						<Button variant="destructive" size="sm" loading={isDeleting} onClick={handleDelete}>
							Remove
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</div>
	);
}
