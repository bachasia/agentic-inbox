import { Loader } from "@cloudflare/kumo";
import { useEffect } from "react";
import { Link as RouterLink, Outlet, useNavigate } from "react-router";
import { authClient } from "~/lib/auth-client";

export function meta() {
	return [{ title: "Admin — Agentic Inbox" }];
}

export default function AdminLayout() {
	const { data: session, isPending } = authClient.useSession();
	const navigate = useNavigate();

	useEffect(() => {
		if (!isPending && session?.user?.role !== "admin") {
			navigate("/", { replace: true });
		}
	}, [session, isPending, navigate]);

	if (isPending) {
		return (
			<div className="flex items-center justify-center h-screen">
				<Loader size="lg" />
			</div>
		);
	}

	if (session?.user?.role !== "admin") return null;

	return (
		<div className="min-h-screen bg-kumo-recessed">
			<header className="border-b border-kumo-line bg-kumo-base">
				<div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<RouterLink
							to="/"
							className="text-sm text-kumo-subtle hover:text-kumo-default transition-colors"
						>
							← Mailboxes
						</RouterLink>
						<span className="text-kumo-line">|</span>
						<div className="flex items-center gap-1.5">
							<span
								className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
								style={{ background: "var(--home-indigo)" }}
							/>
							<h1 className="text-sm font-semibold text-kumo-default">Admin Panel</h1>
						</div>
					</div>
					<span className="text-xs font-mono text-kumo-subtle">{session.user.email}</span>
				</div>
			</header>
			<main className="mx-auto max-w-5xl px-4 py-8">
				<Outlet />
			</main>
		</div>
	);
}
