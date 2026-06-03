import { GlobeIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { authClient } from "~/lib/auth-client";
import { useMailboxes } from "~/queries/mailboxes";
import { queryKeys } from "~/queries/keys";
import api from "~/services/api";
import HomeSidebar from "~/components/home/home-sidebar";
import HomeTopBar from "~/components/home/home-top-bar";

export function meta() {
	return [{ title: "Domains — Agentic Inbox" }];
}

export default function DomainsRoute() {
	const { data: session } = authClient.useSession();
	const { data: mailboxes = [], isLoading: mailboxesLoading } = useMailboxes();

	const { data: configData, isLoading: configLoading } = useQuery({
		queryKey: queryKeys.config,
		queryFn: () => api.getConfig(),
		staleTime: Infinity,
	});

	const isLoading = configLoading || mailboxesLoading;

	const totalUnread = mailboxes.reduce(
		(s, m) => s + ((m as any).summary?.inboxUnreadCount ?? 0),
		0,
	);

	// Group mailboxes by domain with count
	const domainRows = useMemo(() => {
		const counts: Record<string, number> = {};
		for (const m of mailboxes) {
			const d = m.email.split("@")[1] ?? "unknown";
			counts[d] = (counts[d] ?? 0) + 1;
		}
		const configured = configData?.domains ?? [];
		// Include configured domains even if they have no mailboxes yet
		const allDomains = Array.from(new Set([...configured, ...Object.keys(counts)])).sort();
		return allDomains.map((domain) => ({
			domain,
			mailboxCount: counts[domain] ?? 0,
			isConfigured: configured.includes(domain),
		}));
	}, [mailboxes, configData]);

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
					pageTitle="Domains"
				/>

				<div className="px-6 lg:px-10 pt-8 pb-6">
					<h1 className="text-3xl font-semibold tracking-tight text-kumo-default">Domains</h1>
					<p className="mt-1.5 text-sm text-kumo-subtle">
						Connected domains and their mailbox counts.
					</p>
				</div>

				<div className="px-6 lg:px-10 pb-16">
					{isLoading ? (
						<div className="space-y-3">
							{Array.from({ length: 3 }).map((_, i) => (
								<div key={i} className="h-16 rounded-xl bg-kumo-fill animate-pulse" />
							))}
						</div>
					) : domainRows.length === 0 ? (
						<div className="rounded-xl border border-kumo-line bg-kumo-base py-16 flex flex-col items-center text-center">
							<GlobeIcon size={48} weight="thin" className="text-kumo-subtle mb-4" />
							<h3 className="text-base font-semibold text-kumo-default mb-1.5">No domains configured</h3>
							<p className="text-sm text-kumo-subtle max-w-sm">
								Configure <code className="font-mono text-xs">DOMAINS</code> in your Worker environment to connect domains.
							</p>
						</div>
					) : (
						<div className="rounded-xl border border-kumo-line bg-kumo-base overflow-hidden">
							{domainRows.map(({ domain, mailboxCount, isConfigured }, i) => (
								<div
									key={domain}
									className={`flex items-center gap-4 px-5 py-4 ${
										i > 0 ? "border-t border-kumo-line" : ""
									}`}
								>
									<div
										className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
										style={{ background: "rgba(79,70,229,0.08)" }}
									>
										<GlobeIcon size={18} style={{ color: "var(--home-indigo)" }} />
									</div>

									<div className="flex-1 min-w-0">
										<div className="text-sm font-medium text-kumo-default truncate">{domain}</div>
										<div className="text-xs text-kumo-subtle mt-0.5">
											{isConfigured ? "Configured" : "Mailbox only"}
										</div>
									</div>

									<div className="shrink-0 text-right">
										<div className="text-sm font-semibold text-kumo-default">{mailboxCount}</div>
										<div className="text-xs text-kumo-subtle">
											mailbox{mailboxCount !== 1 ? "es" : ""}
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</main>
		</div>
	);
}
