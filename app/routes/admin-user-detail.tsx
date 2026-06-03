import { Button, Select, Text, useKumoToastManager } from "@cloudflare/kumo";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useMailboxes } from "~/queries/mailboxes";
import {
	useAdminUsers,
	useSetUserMailboxes,
	useUpdateUserCredentials,
	useUpdateUserRole,
	useUserMailboxes,
} from "~/queries/admin";

export default function AdminUserDetailRoute() {
	const { userId } = useParams<{ userId: string }>();
	const navigate = useNavigate();
	const toastManager = useKumoToastManager();

	const { data: usersData } = useAdminUsers();
	const user = usersData?.users.find((u) => u.id === userId);

	const { data: userMailboxData } = useUserMailboxes(userId ?? "");
	const { data: allMailboxes = [] } = useMailboxes();

	const updateRole = useUpdateUserRole();
	const setMailboxes = useSetUserMailboxes();
	const updateCredentials = useUpdateUserCredentials();

	const [role, setRole] = useState<string>("");
	const [assignedMailboxIds, setAssignedMailboxIds] = useState<string[]>([]);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const [profileName, setProfileName] = useState("");
	const [profileEmail, setProfileEmail] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [credError, setCredError] = useState<string | null>(null);
	const [passwordSetError, setPasswordSetError] = useState<string | null>(null);

	useEffect(() => {
		if (user) {
			setRole(user.role);
			setProfileName(user.name);
			setProfileEmail(user.email);
		}
	}, [user]);

	useEffect(() => {
		if (userMailboxData) setAssignedMailboxIds(userMailboxData.mailboxIds);
	}, [userMailboxData]);

	const toggleMailbox = (id: string) => {
		setAssignedMailboxIds((prev) =>
			prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
		);
	};

	const handleSave = async (e: FormEvent) => {
		e.preventDefault();
		if (!userId || !user) return;
		setError(null);
		setIsSaving(true);
		try {
			const ops: Promise<unknown>[] = [
				setMailboxes.mutateAsync({ userId, mailboxIds: assignedMailboxIds }),
			];
			if (role !== user.role) {
				ops.push(updateRole.mutateAsync({ userId, role }));
			}
			await Promise.all(ops);
			toastManager.add({ title: "User updated successfully" });
			navigate("/admin");
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Failed to save changes");
		} finally {
			setIsSaving(false);
		}
	};

	if (!user) {
		return (
			<div className="text-sm text-kumo-subtle">
				{usersData ? "User not found." : "Loading…"}
			</div>
		);
	}

	return (
		<div className="max-w-lg">
			<div className="mb-6">
				<h2 className="text-xl font-bold text-kumo-default">{user.name}</h2>
				<p className="text-sm text-kumo-subtle mt-0.5">{user.email}</p>
			</div>

			<form onSubmit={handleSave} className="space-y-6">
				{error && <Text variant="error" size="sm">{error}</Text>}

				<div className="rounded-xl border border-kumo-line bg-kumo-base p-5 space-y-4">
					<h3 className="text-sm font-semibold text-kumo-default">Role</h3>
					<Select
						aria-label="Role"
						value={role}
						onValueChange={(v) => { if (v) setRole(v); }}
					>
						<Select.Option value="admin">admin</Select.Option>
						<Select.Option value="member">member</Select.Option>
					</Select>
				</div>

				<div className="rounded-xl border border-kumo-line bg-kumo-base p-5 space-y-4">
					<h3 className="text-sm font-semibold text-kumo-default">Edit Profile</h3>
					{credError && <Text variant="error" size="sm">{credError}</Text>}
					<div className="space-y-3">
						<div>
							<label className="text-xs text-kumo-subtle mb-1 block">Name</label>
							<input
								type="text"
								value={profileName}
								onChange={(e) => setProfileName(e.target.value)}
								className="w-full rounded-lg border border-kumo-line bg-kumo-base px-3 py-1.5 text-sm text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-accent"
							/>
						</div>
						<div>
							<label className="text-xs text-kumo-subtle mb-1 block">Email</label>
							<input
								type="email"
								value={profileEmail}
								onChange={(e) => setProfileEmail(e.target.value)}
								className="w-full rounded-lg border border-kumo-line bg-kumo-base px-3 py-1.5 text-sm text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-accent"
							/>
						</div>
					</div>
					<div className="flex justify-end">
						<Button
							type="button"
							variant="primary"
							size="sm"
							loading={updateCredentials.isPending}
							onClick={async () => {
								if (!userId || !user) return;
								setCredError(null);
								const credData: { name?: string; email?: string } = {};
								if (profileName !== user.name) credData.name = profileName;
								if (profileEmail !== user.email) credData.email = profileEmail;
								if (!credData.name && !credData.email) {
									toastManager.add({ title: "No changes to save" });
									return;
								}
								try {
									await updateCredentials.mutateAsync({ userId, data: credData });
									toastManager.add({ title: "Profile updated" });
								} catch (err: unknown) {
									setCredError(err instanceof Error ? err.message : "Failed to update profile");
								}
							}}
						>
							Save Profile
						</Button>
					</div>
				</div>

				<div className="rounded-xl border border-kumo-line bg-kumo-base p-5 space-y-4">
					<h3 className="text-sm font-semibold text-kumo-default">Set Password</h3>
					{passwordSetError && <Text variant="error" size="sm">{passwordSetError}</Text>}
					<div>
						<label className="text-xs text-kumo-subtle mb-1 block">New Password</label>
						<input
							type="password"
							value={newPassword}
							onChange={(e) => setNewPassword(e.target.value)}
							placeholder="Min. 8 characters"
							className="w-full rounded-lg border border-kumo-line bg-kumo-base px-3 py-1.5 text-sm text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-accent"
						/>
					</div>
					<div className="flex justify-end">
						<Button
							type="button"
							variant="primary"
							size="sm"
							loading={updateCredentials.isPending}
							onClick={async () => {
								if (!userId) return;
								setPasswordSetError(null);
								if (newPassword.length < 8) {
									setPasswordSetError("Password must be at least 8 characters");
									return;
								}
								try {
									await updateCredentials.mutateAsync({ userId, data: { password: newPassword } });
									setNewPassword("");
									toastManager.add({ title: "Password updated" });
								} catch (err: unknown) {
									setPasswordSetError(err instanceof Error ? err.message : "Failed to update password");
								}
							}}
						>
							Set Password
						</Button>
					</div>
				</div>

				<div className="rounded-xl border border-kumo-line bg-kumo-base p-5 space-y-3">
					<h3 className="text-sm font-semibold text-kumo-default">Mailbox Access</h3>
					{allMailboxes.length === 0 ? (
						<p className="text-sm text-kumo-subtle">No mailboxes available.</p>
					) : (
						<div className="space-y-1">
							{allMailboxes.map((m) => (
								<label
									key={m.id}
									className="flex items-center gap-3 cursor-pointer text-sm py-2 px-3 rounded-lg hover:bg-kumo-tint transition-colors"
								>
									<input
										type="checkbox"
										checked={assignedMailboxIds.includes(m.id)}
										onChange={() => toggleMailbox(m.id)}
										className="rounded"
									/>
									<div>
										<span className="text-kumo-default font-medium">{m.name || m.email}</span>
										<span className="text-kumo-subtle ml-2 text-xs">{m.email}</span>
									</div>
								</label>
							))}
						</div>
					)}
				</div>

				<div className="flex justify-end gap-2">
					<Button
						type="button"
						variant="secondary"
						size="sm"
						onClick={() => navigate("/admin")}
					>
						Cancel
					</Button>
					<Button type="submit" variant="primary" size="sm" loading={isSaving}>
						Save Changes
					</Button>
				</div>
			</form>
		</div>
	);
}
