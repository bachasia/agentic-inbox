import { Button, Input, Text, useKumoToastManager } from "@cloudflare/kumo";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { authClient } from "~/lib/auth-client";

export function meta() {
	return [{ title: "Profile — Agentic Inbox" }];
}

export default function ProfileRoute() {
	const { data: session, isPending } = authClient.useSession();
	const navigate = useNavigate();
	const toastManager = useKumoToastManager();

	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [profileError, setProfileError] = useState<string | null>(null);
	const [isSavingProfile, setIsSavingProfile] = useState(false);

	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [passwordError, setPasswordError] = useState<string | null>(null);
	const [isSavingPassword, setIsSavingPassword] = useState(false);

	useEffect(() => {
		if (!isPending && !session) navigate("/login", { replace: true });
	}, [session, isPending, navigate]);

	useEffect(() => {
		if (session?.user) {
			setName(session.user.name ?? "");
			setEmail(session.user.email ?? "");
		}
	}, [session]);

	const handleSaveProfile = async (e: FormEvent) => {
		e.preventDefault();
		if (!session?.user) return;
		setProfileError(null);
		setIsSavingProfile(true);
		try {
			if (name !== session.user.name) {
				const { error } = await authClient.updateUser({ name });
				if (error) { setProfileError(error.message ?? "Failed to update name"); return; }
			}
			if (email !== session.user.email) {
				const { error } = await authClient.changeEmail({ newEmail: email });
				if (error) { setProfileError(error.message ?? "Failed to update email"); return; }
			}
			if (name === session.user.name && email === session.user.email) {
				toastManager.add({ title: "No changes to save" });
				return;
			}
			toastManager.add({ title: "Profile updated" });
		} finally {
			setIsSavingProfile(false);
		}
	};

	const handleChangePassword = async (e: FormEvent) => {
		e.preventDefault();
		setPasswordError(null);
		if (newPassword !== confirmPassword) {
			setPasswordError("Passwords do not match");
			return;
		}
		if (newPassword.length < 8) {
			setPasswordError("Password must be at least 8 characters");
			return;
		}
		setIsSavingPassword(true);
		try {
			const { error } = await authClient.changePassword({ currentPassword, newPassword });
			if (error) {
				setPasswordError(error.message ?? "Failed to change password");
				return;
			}
			setCurrentPassword("");
			setNewPassword("");
			setConfirmPassword("");
			toastManager.add({ title: "Password changed" });
		} finally {
			setIsSavingPassword(false);
		}
	};

	if (isPending || !session) return null;

	return (
		<div className="min-h-screen bg-kumo-recessed">
			<header className="border-b border-kumo-line bg-kumo-base">
				<div className="mx-auto max-w-lg px-4 py-4 flex items-center gap-3">
					<button
						type="button"
						onClick={() => navigate(-1)}
						className="text-sm text-kumo-subtle hover:text-kumo-default transition-colors"
					>
						← Back
					</button>
					<span className="text-kumo-line">|</span>
					<h1 className="text-sm font-semibold text-kumo-default">Profile</h1>
				</div>
			</header>

			<main className="mx-auto max-w-lg px-4 py-8 space-y-6">
				<form onSubmit={handleSaveProfile} className="rounded-xl border border-kumo-line bg-kumo-base p-5 space-y-4">
					<h2 className="text-sm font-semibold text-kumo-default">Update Profile</h2>
					{profileError && <Text variant="error" size="sm">{profileError}</Text>}
					<div className="space-y-3">
						<div>
							<label className="text-xs text-kumo-subtle mb-1 block">Name</label>
							<Input value={name} onChange={(e) => setName(e.target.value)} required />
						</div>
						<div>
							<label className="text-xs text-kumo-subtle mb-1 block">Email</label>
							<Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
						</div>
					</div>
					<div className="flex justify-end">
						<Button type="submit" variant="primary" size="sm" loading={isSavingProfile}>
							Save Profile
						</Button>
					</div>
				</form>

				<form onSubmit={handleChangePassword} className="rounded-xl border border-kumo-line bg-kumo-base p-5 space-y-4">
					<h2 className="text-sm font-semibold text-kumo-default">Change Password</h2>
					{passwordError && <Text variant="error" size="sm">{passwordError}</Text>}
					<div className="space-y-3">
						<div>
							<label className="text-xs text-kumo-subtle mb-1 block">Current Password</label>
							<Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
						</div>
						<div>
							<label className="text-xs text-kumo-subtle mb-1 block">New Password</label>
							<Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required placeholder="Min. 8 characters" />
						</div>
						<div>
							<label className="text-xs text-kumo-subtle mb-1 block">Confirm Password</label>
							<Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
						</div>
					</div>
					<div className="flex justify-end">
						<Button type="submit" variant="primary" size="sm" loading={isSavingPassword}>
							Change Password
						</Button>
					</div>
				</form>
			</main>
		</div>
	);
}
