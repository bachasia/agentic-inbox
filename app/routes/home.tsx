// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import {
	Button,
	Dialog,
	Input,
	Select,
	Text,
	useKumoToastManager,
} from "@cloudflare/kumo";
import { EnvelopeIcon, GlobeIcon, PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import api from "~/services/api";
import { authClient } from "~/lib/auth-client";
import {
	useCreateMailbox,
	useDeleteMailbox,
	useMailboxes,
} from "~/queries/mailboxes";
import { queryKeys } from "~/queries/keys";
import HomeSidebar from "~/components/home/home-sidebar";
import HomeTopBar from "~/components/home/home-top-bar";
import {
	AddMailboxCard,
	HomeMailboxCard,
	HomeMailboxCardSkeleton,
} from "~/components/home/home-mailbox-card";

function StatChip({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
	return (
		<div
			className="px-4 py-2 rounded-lg border border-kumo-line bg-kumo-base"
			style={accent ? { borderColor: "rgba(79,70,229,0.2)", background: "rgba(79,70,229,0.05)" } : undefined}
		>
			<div className="text-[11px] uppercase tracking-wider text-kumo-subtle">{label}</div>
			<div
				className="text-lg font-semibold text-kumo-default"
				style={accent ? { color: "var(--home-indigo)" } : undefined}
			>
				{value}
			</div>
		</div>
	);
}

function EmptyState({
	isConfigured,
	isAdmin,
	onNewMailbox,
}: {
	isConfigured: boolean;
	isAdmin: boolean;
	onNewMailbox: () => void;
}) {
	return (
		<div className="rounded-xl border border-kumo-line bg-kumo-base py-16 px-6">
			<div className="flex flex-col items-center text-center">
				<div className="mb-4">
					<EnvelopeIcon size={48} weight="thin" className="text-kumo-subtle" />
				</div>
				<h3 className="text-base font-semibold text-kumo-default mb-1.5">No mailboxes yet</h3>
				<p className="text-sm text-kumo-subtle max-w-sm mb-5">
					{isConfigured
						? "Your email routing is configured but no mailboxes have been created yet. They will appear here automatically."
						: "Create a mailbox to start sending and receiving emails with your domain."}
				</p>
				{isAdmin && !isConfigured && (
					<Button variant="primary" icon={<PlusIcon size={16} />} onClick={onNewMailbox}>
						Create Mailbox
					</Button>
				)}
			</div>
		</div>
	);
}

export function meta() {
	return [{ title: "Agentic Inbox" }];
}

export default function HomeRoute() {
	const toastManager = useKumoToastManager();
	const { data: session } = authClient.useSession();
	const isAdmin = session?.user?.role === "admin";
	const { data: mailboxes = [], refetch: refetchMailboxes, isFetched: mailboxesFetched, isLoading: mailboxesLoading } = useMailboxes();
	const createMailbox = useCreateMailbox();
	const deleteMailbox = useDeleteMailbox();

	const { data: configData } = useQuery({
		queryKey: queryKeys.config,
		queryFn: () => api.getConfig(),
		staleTime: Infinity,
	});

	const domains = (configData?.domains ?? []).map((d) => d.domain);
	const emailAddresses = configData?.emailAddresses ?? [];

	// UI state
	const [searchQuery, setSearchQuery] = useState("");
	const [activeDomain, setActiveDomain] = useState<string | null>(null);
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [newPrefix, setNewPrefix] = useState("");
	const [selectedDomain, setSelectedDomain] = useState("");
	const [newName, setNewName] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [mailboxToDelete, setMailboxToDelete] = useState<{ id: string; email: string } | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);

	useEffect(() => {
		if (domains.length > 0 && !selectedDomain) {
			setSelectedDomain(domains[0]);
		}
	}, [domains, selectedDomain]);

	// Auto-create mailboxes from config (run once when both data sources are ready)
	const autoCreateDone = useRef(false);
	useEffect(() => {
		if (autoCreateDone.current) return;
		if (emailAddresses.length === 0 || !mailboxesFetched) return;
		const existingEmails = new Set(mailboxes.map((m) => m.email.toLowerCase()));
		const toCreate = emailAddresses.filter((addr) => !existingEmails.has(addr.toLowerCase()));
		if (toCreate.length === 0) { autoCreateDone.current = true; return; }
		autoCreateDone.current = true;
		let cancelled = false;
		Promise.all(
			toCreate.map((addr) => {
				const localPart = addr.split("@")[0] || addr;
				return api.createMailbox(addr, localPart).catch(() => {});
			}),
		).then(() => { if (!cancelled) refetchMailboxes(); });
		return () => { cancelled = true; };
	}, [emailAddresses, mailboxes, refetchMailboxes, mailboxesFetched]);

	const isConfigured = emailAddresses.length > 0;
	const canDelete = isAdmin && !isConfigured;

	const accounts = useMemo(() => {
		if (isConfigured) {
			return emailAddresses.map((addr) => {
				const found = mailboxes.find(m => m.email.toLowerCase() === addr.toLowerCase());
				return found ?? { id: addr, email: addr, name: addr.split("@")[0] || addr };
			});
		}
		return mailboxes;
	}, [isConfigured, emailAddresses, mailboxes]);

	const groupedByDomain = useMemo(() => {
		const groups: Record<string, typeof accounts> = {};
		for (const account of accounts) {
			const domain = account.email.split("@")[1] || "unknown";
			(groups[domain] ??= []).push(account);
		}
		return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
	}, [accounts]);

	const totalUnread = useMemo(
		() => accounts.reduce((sum, a) => sum + (("summary" in a ? a.summary?.inboxUnreadCount : undefined) ?? 0), 0),
		[accounts],
	);

	const visibleGroups = useMemo(() => {
		let groups = groupedByDomain;
		if (activeDomain) {
			groups = groups.filter(([d]) => d === activeDomain);
		}
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			groups = groups
				.map(([d, accs]) => [d, accs.filter(a => a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q))] as typeof groupedByDomain[0])
				.filter(([, accs]) => accs.length > 0);
		}
		return groups;
	}, [groupedByDomain, activeDomain, searchQuery]);

	const handleCreate = async (e: FormEvent) => {
		e.preventDefault();
		setCreateError(null);
		if (!newPrefix || !selectedDomain) { setCreateError("Please fill in all fields"); return; }
		const email = `${newPrefix}@${selectedDomain}`;
		const name = newName || newPrefix;
		setIsCreating(true);
		try {
			await createMailbox.mutateAsync({ email, name });
			toastManager.add({ title: "Mailbox created successfully!" });
			setIsCreateOpen(false);
			setNewPrefix("");
			setNewName("");
		} catch (err: unknown) {
			setCreateError((err instanceof Error ? err.message : null) || "Failed to create mailbox");
		} finally {
			setIsCreating(false);
		}
	};

	const handleDelete = async () => {
		if (!mailboxToDelete) return;
		setIsDeleting(true);
		try {
			await deleteMailbox.mutateAsync(mailboxToDelete.id);
			toastManager.add({ title: "Mailbox deleted" });
			setIsDeleteOpen(false);
			setMailboxToDelete(null);
		} catch {
			toastManager.add({ title: "Failed to delete mailbox", variant: "error" });
		} finally {
			setIsDeleting(false);
		}
	};

	const isLoading = !configData || mailboxesLoading;
	const showGroupHeaders = groupedByDomain.length > 1 || !!activeDomain;

	return (
		<div className="flex min-h-screen bg-kumo-recessed">
			<HomeSidebar
				accounts={accounts}
				activeDomain={activeDomain}
				onDomainChange={setActiveDomain}
				totalUnread={totalUnread}
				user={session?.user}
				isAdmin={isAdmin}
			/>

			<main className="flex-1 min-w-0">
				<HomeTopBar
					searchQuery={searchQuery}
					onSearchChange={setSearchQuery}
					onNewMailbox={() => setIsCreateOpen(true)}
					showNewMailbox={isAdmin && !isConfigured}
				/>

				{/* Page header */}
				<div className="px-6 lg:px-10 pt-8 pb-6 flex items-end justify-between gap-6 flex-wrap">
					<div>
						<h1 className="text-3xl font-semibold tracking-tight text-kumo-default">Mailboxes</h1>
						<p className="mt-1.5 text-sm text-kumo-subtle">
							All inboxes across your {groupedByDomain.length} connected{" "}
							{groupedByDomain.length === 1 ? "domain" : "domains"}.
						</p>
					</div>
					{!isLoading && accounts.length > 0 && (
						<div className="flex items-center gap-2">
							<StatChip label="Domains" value={groupedByDomain.length} />
							<StatChip label="Mailboxes" value={accounts.length} />
							<StatChip label="Unread" value={totalUnread} accent={totalUnread > 0} />
						</div>
					)}
				</div>

				{/* Mailbox groups */}
				<div className="px-6 lg:px-10 pb-16">
					{isLoading ? (
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
							{Array.from({ length: 3 }).map((_, i) => (
								<HomeMailboxCardSkeleton key={i} />
							))}
						</div>
					) : accounts.length === 0 ? (
						<EmptyState isConfigured={isConfigured} isAdmin={isAdmin} onNewMailbox={() => setIsCreateOpen(true)} />
					) : (
						<div className="space-y-10">
							{visibleGroups.map(([domain, domainAccounts]) => (
								<div key={domain}>
									{showGroupHeaders && (
										<div className="flex items-center gap-3 mb-4">
											<div className="flex items-center gap-1.5">
												<GlobeIcon size={14} className="text-kumo-subtle" />
												<h2 className="text-sm font-semibold text-kumo-default">{domain}</h2>
												<span className="text-xs text-kumo-subtle">
													· {domainAccounts.length} mailbox{domainAccounts.length !== 1 ? "es" : ""}
												</span>
											</div>
											<div className="flex-1 h-px bg-kumo-line" />
										</div>
									)}
									<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
										{domainAccounts.map((account) => (
											<HomeMailboxCard
												key={account.id}
												account={account}
												onDelete={canDelete ? () => {
													setMailboxToDelete({ id: account.id, email: account.email });
													setIsDeleteOpen(true);
												} : undefined}
											/>
										))}
										{canDelete && (
											<AddMailboxCard domain={domain} onClick={() => setIsCreateOpen(true)} />
										)}
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</main>

			{/* Create Dialog */}
			<Dialog.Root open={isCreateOpen} onOpenChange={setIsCreateOpen}>
				<Dialog size="sm" className="p-6">
					<Dialog.Title className="text-base font-semibold mb-5">Create New Mailbox</Dialog.Title>
					<form onSubmit={handleCreate} className="space-y-4">
						{createError && <Text variant="error" size="sm">{createError}</Text>}
						<div>
							<span className="text-sm font-medium text-kumo-default mb-1.5 block">Email Address</span>
							<div className="flex items-center gap-2">
								<div className="flex-1">
									<Input
										aria-label="Address prefix"
										placeholder="info"
										size="sm"
										value={newPrefix}
										onChange={(e) => setNewPrefix(e.target.value)}
										required
									/>
								</div>
								<span className="text-sm text-kumo-subtle">@</span>
								{domains.length > 1 ? (
									<div className="flex-1">
										<Select
											aria-label="Domain"
											value={selectedDomain}
											onValueChange={(value) => { if (value) setSelectedDomain(value); }}
										>
											{domains.map((d) => (
												<Select.Option key={d} value={d}>{d}</Select.Option>
											))}
										</Select>
									</div>
								) : (
									<span className="text-sm text-kumo-subtle">{selectedDomain || "no domain"}</span>
								)}
							</div>
						</div>
						<Input
							label="Display Name (optional)"
							placeholder="Info"
							size="sm"
							value={newName}
							onChange={(e) => setNewName(e.target.value)}
						/>
						<div className="flex justify-end gap-2 pt-2">
							<Dialog.Close render={(props) => <Button {...props} variant="secondary" size="sm">Cancel</Button>} />
							<Button type="submit" variant="primary" size="sm" loading={isCreating} disabled={!selectedDomain}>
								Create
							</Button>
						</div>
					</form>
				</Dialog>
			</Dialog.Root>

			{/* Delete Dialog */}
			<Dialog.Root
				open={isDeleteOpen}
				onOpenChange={(open) => { setIsDeleteOpen(open); if (!open) setMailboxToDelete(null); }}
			>
				<Dialog size="sm" className="p-6">
					<Dialog.Title className="text-base font-semibold mb-2">Delete Mailbox</Dialog.Title>
					<Dialog.Description className="text-kumo-subtle text-sm mb-5">
						Are you sure you want to delete{" "}
						<strong className="text-kumo-default">{mailboxToDelete?.email}</strong>? This action cannot be undone.
					</Dialog.Description>
					<div className="flex justify-end gap-2">
						<Dialog.Close render={(props) => <Button {...props} variant="secondary" size="sm">Cancel</Button>} />
						<Button variant="destructive" size="sm" loading={isDeleting} onClick={handleDelete}>
							Delete
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</div>
	);
}
