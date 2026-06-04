import { GlobeIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button, Dialog, Input } from "@cloudflare/kumo";
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
	const queryClient = useQueryClient();

	const { data: configData, isLoading: configLoading } = useQuery({
		queryKey: queryKeys.config,
		queryFn: () => api.getConfig(),
		staleTime: Infinity,
	});

	const isLoading = configLoading || mailboxesLoading;
	const isAdmin = session?.user?.role === "admin";

	const totalUnread = mailboxes.reduce(
		(s, m) => s + ((m as any).summary?.inboxUnreadCount ?? 0),
		0,
	);

	// Add domain dialog state
	const [isAdding, setIsAdding] = useState(false);
	const [newDomain, setNewDomain] = useState("");
	const [addError, setAddError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);

	const handleAddDomain = async () => {
		if (!newDomain.trim()) return;
		setIsSaving(true);
		setAddError(null);
		try {
			await api.addDomain(newDomain.trim());
			queryClient.invalidateQueries({ queryKey: queryKeys.config });
			setIsAdding(false);
			setNewDomain("");
		} catch (e: any) {
			setAddError(e.message ?? "Failed to add domain");
		} finally {
			setIsSaving(false);
		}
	};

	const handleDeleteDomain = async (domain: string) => {
		if (!confirm(`Remove domain "${domain}"? Mailboxes under this domain remain intact.`)) return;
		try {
			await api.deleteDomain(domain);
			queryClient.invalidateQueries({ queryKey: queryKeys.config });
		} catch (e: any) {
			alert(e.message ?? "Failed to delete domain");
		}
	};

	// Group mailboxes by domain with count, merging DomainInfo from config
	const domainRows = useMemo(() => {
		const counts: Record<string, number> = {};
		for (const m of mailboxes) {
			const d = m.email.split("@")[1] ?? "unknown";
			counts[d] = (counts[d] ?? 0) + 1;
		}
		const configuredDomains = configData?.domains ?? [];
		const allDomains = Array.from(
			new Set([...configuredDomains.map((d) => d.domain), ...Object.keys(counts)])
		).sort();

		return allDomains.map((domain) => {
			const info = configuredDomains.find((d) => d.domain === domain);
			return {
				domain,
				mailboxCount: counts[domain] ?? 0,
				isConfigured: !!info,
				source: info?.source ?? "custom",
			};
		});
	}, [mailboxes, configData]);

	return (
		<div className="flex min-h-screen bg-kumo-recessed">
			<HomeSidebar
				accounts={mailboxes}
				activeDomain={null}
				onDomainChange={() => {}}
				totalUnread={totalUnread}
				user={session?.user}
				isAdmin={isAdmin}
			/>

			<main className="flex-1 min-w-0">
				<HomeTopBar
					searchQuery=""
					onSearchChange={() => {}}
					onNewMailbox={() => {}}
					showNewMailbox={false}
					pageTitle="Domains"
				/>

				<div className="px-6 lg:px-10 pt-8 pb-6 flex items-start justify-between gap-6 flex-wrap">
					<div>
						<h1 className="text-3xl font-semibold tracking-tight text-kumo-default">Domains</h1>
						<p className="mt-1.5 text-sm text-kumo-subtle">
							Connected domains and their mailbox counts.
						</p>
						{!isLoading && domainRows.length > 0 && (
							<div className="flex items-center gap-2 mt-4">
								<div className="px-4 py-2 rounded-lg border border-kumo-line bg-kumo-base">
									<div className="text-[11px] uppercase tracking-wider text-kumo-subtle">Domains</div>
									<div className="text-lg font-semibold text-kumo-default">{domainRows.length}</div>
								</div>
								<div className="px-4 py-2 rounded-lg border border-kumo-line bg-kumo-base">
									<div className="text-[11px] uppercase tracking-wider text-kumo-subtle">Mailboxes</div>
									<div className="text-lg font-semibold text-kumo-default">{mailboxes.length}</div>
								</div>
							</div>
						)}
					</div>
					{isAdmin && (
						<Button
							variant="primary"
							size="sm"
							icon={<PlusIcon size={14} />}
							onClick={() => setIsAdding(true)}
						>
							Add Domain
						</Button>
					)}
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
								Configure <code className="font-mono text-xs">DOMAINS</code> in your Worker environment or add a custom domain above.
							</p>
						</div>
					) : (
						<div className="rounded-xl border border-kumo-line bg-kumo-base overflow-hidden">
							{domainRows.map(({ domain, mailboxCount, isConfigured, source }, i) => (
								<div
									key={domain}
									className={`home-mailbox-card flex items-center gap-4 px-5 py-4 transition-colors hover:bg-kumo-fill ${
										i > 0 ? "border-t border-kumo-line" : ""
									}`}
								>
									<div
										className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0 shadow-sm"
										style={{ background: isConfigured ? "rgba(79,70,229,0.1)" : "rgba(107,114,128,0.08)" }}
									>
										<GlobeIcon size={18} style={{ color: isConfigured ? "var(--home-indigo)" : "#6b7280" }} />
									</div>

									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2 flex-wrap">
											<span className="text-sm font-semibold text-kumo-default truncate">{domain}</span>
											{/* Source badge: env (read-only) vs custom (deletable) */}
											{source === "env" ? (
												<span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-kumo-fill text-kumo-subtle border border-kumo-line shrink-0">
													env
												</span>
											) : (
												<span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0">
													custom
												</span>
											)}
											{isConfigured && (
												<span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
													style={{ background: "rgba(79,70,229,0.08)", color: "var(--home-indigo)" }}
												>
													<span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--home-indigo)" }} />
													Configured
												</span>
											)}
										</div>
										<div className="text-xs text-kumo-subtle font-mono mt-0.5 truncate">{domain}</div>
									</div>

									<div className="shrink-0 text-right">
										<div className="text-lg font-semibold text-kumo-default">{mailboxCount}</div>
										<div className="text-xs text-kumo-subtle">
											mailbox{mailboxCount !== 1 ? "es" : ""}
										</div>
									</div>

									{/* Delete only for custom domains and only for admins */}
									{isAdmin && source === "custom" && (
										<button
											type="button"
											onClick={() => handleDeleteDomain(domain)}
											className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-kumo-subtle hover:bg-red-50 hover:text-red-500 transition-colors cursor-pointer"
											aria-label={`Remove ${domain}`}
										>
											<TrashIcon size={15} />
										</button>
									)}
								</div>
							))}
						</div>
					)}
				</div>
			</main>

			{/* Add Domain Dialog */}
			<Dialog.Root
				open={isAdding}
				onOpenChange={(open) => {
					setIsAdding(open);
					if (!open) { setNewDomain(""); setAddError(null); }
				}}
			>
				<Dialog size="sm" className="p-6">
					<Dialog.Title className="text-base font-semibold mb-4">Add Domain</Dialog.Title>
					<div className="space-y-4">
						<Input
							label="Domain name"
							placeholder="example.com"
							value={newDomain}
							onChange={(e) => setNewDomain(e.target.value)}
							onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && handleAddDomain()}
							autoFocus
						/>
						{addError && <p className="text-sm text-red-500">{addError}</p>}
						<p className="text-xs text-kumo-subtle">
							After adding, set up email routing for this domain in the Cloudflare dashboard.
						</p>
					</div>
					<div className="flex justify-end gap-2 mt-6">
						<Dialog.Close render={(props) => (
							<Button {...props} variant="secondary" onClick={() => setIsAdding(false)}>Cancel</Button>
						)} />
						<Button
							variant="primary"
							loading={isSaving}
							disabled={!newDomain.trim()}
							onClick={handleAddDomain}
						>
							Add Domain
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</div>
	);
}
