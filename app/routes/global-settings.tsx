import { Button } from "@cloudflare/kumo";
import { UserIcon } from "@phosphor-icons/react";
import { useNavigate } from "react-router";
import { authClient } from "~/lib/auth-client";
import { useMailboxes } from "~/queries/mailboxes";
import HomeSidebar from "~/components/home/home-sidebar";
import HomeTopBar from "~/components/home/home-top-bar";
import ThemeToggleButton from "~/components/theme-toggle-button";

export function meta() {
	return [{ title: "Settings — Agentic Inbox" }];
}

export default function GlobalSettingsRoute() {
	const { data: session } = authClient.useSession();
	const { data: mailboxes = [] } = useMailboxes();
	const navigate = useNavigate();

	const totalUnread = mailboxes.reduce(
		(s, m) => s + ((m as any).summary?.inboxUnreadCount ?? 0),
		0,
	);

	const displayName = session?.user?.name ?? session?.user?.email?.split("@")[0] ?? "User";

	return (
		<div className="flex min-h-screen bg-kumo-recessed">
			<HomeSidebar
				accounts={mailboxes}
				activeDomain={null}
				onDomainChange={() => {}}
				totalUnread={totalUnread}
				user={session?.user}
				isAdmin={session?.user?.role === "admin"}
			/>

			<main className="flex-1 min-w-0">
				<HomeTopBar
					searchQuery=""
					onSearchChange={() => {}}
					onNewMailbox={() => {}}
					showNewMailbox={false}
					pageTitle="Settings"
				/>

				<div className="px-6 lg:px-10 pt-8 pb-6">
					<h1 className="text-3xl font-semibold tracking-tight text-kumo-default">Settings</h1>
					<p className="mt-1.5 text-sm text-kumo-subtle">App preferences and account settings.</p>
				</div>

				<div className="px-6 lg:px-10 pb-16 space-y-6 max-w-2xl">
					{/* Appearance */}
					<section className="rounded-xl border border-kumo-line bg-kumo-base overflow-hidden">
						<div className="px-5 py-4 border-b border-kumo-line">
							<h2 className="text-sm font-semibold text-kumo-default">Appearance</h2>
							<p className="text-xs text-kumo-subtle mt-0.5">Customize the look of the app.</p>
						</div>
						<div className="px-5 py-4 flex items-center justify-between">
							<div>
								<div className="text-sm font-medium text-kumo-default">Theme</div>
								<div className="text-xs text-kumo-subtle mt-0.5">Toggle between light, dark, and system theme.</div>
							</div>
							<ThemeToggleButton />
						</div>
					</section>

					{/* Account */}
					<section className="rounded-xl border border-kumo-line bg-kumo-base overflow-hidden">
						<div className="px-5 py-4 border-b border-kumo-line">
							<h2 className="text-sm font-semibold text-kumo-default">Account</h2>
							<p className="text-xs text-kumo-subtle mt-0.5">Manage your profile and credentials.</p>
						</div>
						<div className="px-5 py-4 flex items-center justify-between gap-4">
							<div className="flex items-center gap-3 min-w-0">
								<div
									className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
									style={{ background: "linear-gradient(135deg, var(--home-indigo), #a855f7)" }}
								>
									{displayName.slice(0, 2).toUpperCase()}
								</div>
								<div className="min-w-0">
									<div className="text-sm font-medium text-kumo-default truncate">{displayName}</div>
									<div className="text-xs text-kumo-subtle truncate">{session?.user?.email ?? ""}</div>
								</div>
							</div>
							<Button
								variant="secondary"
								size="sm"
								icon={<UserIcon size={14} />}
								onClick={() => navigate("/profile")}
							>
								Edit Profile
							</Button>
						</div>
					</section>
				</div>
			</main>
		</div>
	);
}
