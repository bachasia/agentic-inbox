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
import { EnvelopeIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink } from "react-router";
import api from "~/services/api";
import {
	useCreateMailbox,
	useDeleteMailbox,
	useMailboxes,
} from "~/queries/mailboxes";
import { queryKeys } from "~/queries/keys";
import { formatRelativeDate } from "shared/dates";

function getAvatarColor(email: string): string {
	let hash = 0;
	for (let i = 0; i < email.length; i++) {
		hash = email.charCodeAt(i) + ((hash << 5) - hash);
	}
	const hue = Math.abs(hash) % 360;
	return `hsl(${hue}, 55%, 45%)`;
}

function parseSenderName(sender: string): string {
	const match = sender.match(/^(.+?)\s*<.+>$/);
	return match ? match[1].trim() : sender.split("@")[0];
}

function MailboxCardSkeleton() {
	return (
		<div className="flex items-center gap-4 px-5 py-4 animate-pulse">
			<div className="h-10 w-10 rounded-full bg-kumo-fill shrink-0" />
			<div className="flex-1 space-y-2">
				<div className="h-4 w-32 rounded bg-kumo-fill" />
				<div className="h-3 w-48 rounded bg-kumo-fill" />
			</div>
		</div>
	);
}

export function meta() {
	return [{ title: "Agentic Inbox" }];
}

export default function HomeRoute() {
	const toastManager = useKumoToastManager();
	const { data: mailboxes = [], refetch: refetchMailboxes, isFetched: mailboxesFetched, isLoading: mailboxesLoading } = useMailboxes();
	const createMailbox = useCreateMailbox();
	const deleteMailbox = useDeleteMailbox();

	const { data: configData } = useQuery({
		queryKey: queryKeys.config,
		queryFn: () => api.getConfig(),
		staleTime: Infinity, // config rarely changes
	});

	const domains = configData?.domains ?? [];
	const emailAddresses = configData?.emailAddresses ?? [];

	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [newPrefix, setNewPrefix] = useState("");
	const [selectedDomain, setSelectedDomain] = useState("");
	const [newName, setNewName] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [mailboxToDelete, setMailboxToDelete] = useState<{
		id: string;
		email: string;
	} | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);

	// Set default domain when config loads
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
		const existingEmails = new Set(
			mailboxes.map((m) => m.email.toLowerCase()),
		);
		const toCreate = emailAddresses.filter(
			(addr) => !existingEmails.has(addr.toLowerCase()),
		);
		if (toCreate.length === 0) {
			autoCreateDone.current = true;
			return;
		}
		autoCreateDone.current = true;
		let cancelled = false;
		Promise.all(
			toCreate.map((addr) => {
				const localPart = addr.split("@")[0] || addr;
				return api.createMailbox(addr, localPart).catch(() => {});
			}),
		).then(() => { if (!cancelled) refetchMailboxes(); });
		return () => { cancelled = true; };
	}, [emailAddresses, mailboxes, refetchMailboxes]);

	const handleCreate = async (e: FormEvent) => {
		e.preventDefault();
		setCreateError(null);
		if (!newPrefix || !selectedDomain) {
			setCreateError("Please fill in all fields");
			return;
		}
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
			const message = (err instanceof Error ? err.message : null) || "Failed to create mailbox";
			setCreateError(message);
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

	const isConfigured = emailAddresses.length > 0;
	const accounts = useMemo(() => {
		if (isConfigured) {
			return emailAddresses.map((addr) => {
				const found = mailboxes.find(m => m.email.toLowerCase() === addr.toLowerCase());
				return found ?? { id: addr, email: addr, name: addr.split("@")[0] || addr };
			});
		}
		return mailboxes;
	}, [isConfigured, emailAddresses, mailboxes]);

	const isLoading = !configData || mailboxesLoading;

	const groupedByDomain = useMemo(() => {
		const groups: Record<string, typeof accounts> = {};
		for (const account of accounts) {
			const domain = account.email.split("@")[1] || "unknown";
			(groups[domain] ??= []).push(account);
		}
		return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
	}, [accounts]);

	const hasMultipleDomains = groupedByDomain.length > 1;

	return (
		<div className="min-h-screen bg-kumo-recessed">
			<div className="mx-auto max-w-2xl px-4 py-8 md:px-6 md:py-16">
				<div className="mb-8">
					<div className="flex items-center justify-between">
						<h1 className="text-2xl font-bold text-kumo-default">Mailboxes</h1>
						{!isConfigured && (
							<Button
								variant="primary"
								icon={<PlusIcon size={16} />}
								onClick={() => setIsCreateOpen(true)}
							>
								New Mailbox
							</Button>
						)}
					</div>
					{domains.length > 0 && (
						<p className="text-sm text-kumo-subtle mt-1">
							{domains.join(", ")}
						</p>
					)}
				</div>

				{isLoading ? (
					<div className="rounded-xl border border-kumo-line bg-kumo-base overflow-hidden">
						<MailboxCardSkeleton />
						<div className="border-t border-kumo-line"><MailboxCardSkeleton /></div>
						<div className="border-t border-kumo-line"><MailboxCardSkeleton /></div>
					</div>
				) : accounts.length > 0 ? (
					<div className="space-y-4">
						{groupedByDomain.map(([domain, domainAccounts]) => (
							<div key={domain}>
								{hasMultipleDomains && (
									<div className="flex items-center gap-2 px-1 mb-2">
										<span className="text-xs uppercase tracking-wider font-semibold text-kumo-subtle">
											{domain}
										</span>
										<div className="flex-1 border-t border-kumo-line" />
									</div>
								)}
								<div className="rounded-xl border border-kumo-line bg-kumo-base overflow-hidden">
									{domainAccounts.map((account, idx) => {
										const unreadCount = ('summary' in account ? account.summary?.inboxUnreadCount : undefined) ?? 0;
										const hasUnread = unreadCount > 0;
										const latestEmail = 'summary' in account ? account.summary?.latestEmail : undefined;
										return (
										<RouterLink
											key={account.id}
											to={`/mailbox/${account.id}`}
											className={`group flex items-center gap-4 px-5 py-4 no-underline transition-all duration-150 hover:bg-kumo-tint hover:shadow-sm border-l-2 ${
												idx > 0 ? "border-t border-kumo-line" : ""
											} ${hasUnread ? "border-l-kumo-brand" : "border-l-transparent"}`}
										>
											<div
												className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
												style={{ backgroundColor: getAvatarColor(account.email) }}
											>
												{account.name.charAt(0).toUpperCase()}
											</div>
											<div className="min-w-0 flex-1">
												<div className="flex items-center justify-between gap-2">
													<span className={`text-sm text-kumo-default truncate ${hasUnread ? "font-semibold" : "font-medium"}`}>
														{account.name}
													</span>
													{hasUnread && (
														<span className="shrink-0 rounded-full bg-kumo-brand px-2 py-0.5 text-xs font-semibold text-kumo-inverse">
															{unreadCount}
														</span>
													)}
												</div>
												<div className="text-sm text-kumo-subtle">{account.email}</div>
												{latestEmail && (
													<div className="flex items-center justify-between gap-2 mt-1">
														<span className="text-xs text-kumo-subtle truncate">
															{parseSenderName(latestEmail.sender ?? "")}
															{latestEmail.subject ? ` · ${latestEmail.subject}` : ""}
														</span>
														{latestEmail.date && (
															<span className="shrink-0 text-xs text-kumo-subtle">
																{formatRelativeDate(latestEmail.date)}
															</span>
														)}
													</div>
												)}
												{('status' in account && (account.status?.forwardingEnabled || account.status?.autoReplyEnabled)) && (
													<div className="flex gap-2 mt-1">
														{account.status?.forwardingEnabled && (
															<span className="text-xs text-kumo-subtle">⟳ Forwarding</span>
														)}
														{account.status?.autoReplyEnabled && (
															<span className="text-xs text-kumo-subtle">↩ Auto-reply</span>
														)}
													</div>
												)}
											</div>
											{!isConfigured && (
												<Button
													variant="ghost"
													size="sm"
													shape="square"
													icon={<TrashIcon size={16} />}
													aria-label={`Delete mailbox ${account.email}`}
													onClick={(e) => {
														e.preventDefault();
														e.stopPropagation();
														setMailboxToDelete({
															id: account.id,
															email: account.email,
														});
														setIsDeleteOpen(true);
													}}
												/>
											)}
										</RouterLink>
										);
									})}
								</div>
							</div>
						))}
					</div>
				) : (
					<div className="rounded-xl border border-kumo-line bg-kumo-base py-16 px-6">
						<div className="flex flex-col items-center text-center">
							<div className="mb-4">
								<EnvelopeIcon
									size={48}
									weight="thin"
									className="text-kumo-subtle"
								/>
							</div>
							<h3 className="text-base font-semibold text-kumo-default mb-1.5">
								No mailboxes yet
							</h3>
							<p className="text-sm text-kumo-subtle max-w-sm mb-5">
								{isConfigured
									? "Your email routing is configured but no mailboxes have been created yet. They will appear here automatically."
									: "Create a mailbox to start sending and receiving emails with your domain."}
							</p>
							{!isConfigured && (
								<Button
									variant="primary"
									icon={<PlusIcon size={16} />}
									onClick={() => setIsCreateOpen(true)}
								>
									Create Mailbox
								</Button>
							)}
						</div>
					</div>
				)}
			</div>

			{/* Create Dialog */}
			<Dialog.Root open={isCreateOpen} onOpenChange={setIsCreateOpen}>
				<Dialog size="sm" className="p-6">
					<Dialog.Title className="text-base font-semibold mb-5">
						Create New Mailbox
					</Dialog.Title>
					<form onSubmit={handleCreate} className="space-y-4">
						{createError && (
							<Text variant="error" size="sm">
								{createError}
							</Text>
						)}
						<div>
							<span className="text-sm font-medium text-kumo-default mb-1.5 block">
								Email Address
							</span>
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
								onValueChange={(value) => {
									if (value) setSelectedDomain(value);
								}}
							>
											{domains.map((d) => (
												<Select.Option key={d} value={d}>
													{d}
												</Select.Option>
											))}
										</Select>
									</div>
								) : (
									<span className="text-sm text-kumo-subtle">
										{selectedDomain || "no domain"}
									</span>
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
							<Dialog.Close
								render={(props) => (
									<Button {...props} variant="secondary" size="sm">
										Cancel
									</Button>
								)}
							/>
							<Button
								type="submit"
								variant="primary"
								size="sm"
								loading={isCreating}
								disabled={!selectedDomain}
							>
								Create
							</Button>
						</div>
					</form>
				</Dialog>
			</Dialog.Root>

			{/* Delete Dialog */}
			<Dialog.Root
				open={isDeleteOpen}
				onOpenChange={(open) => {
					setIsDeleteOpen(open);
					if (!open) setMailboxToDelete(null);
				}}
			>
				<Dialog size="sm" className="p-6">
					<Dialog.Title className="text-base font-semibold mb-2">
						Delete Mailbox
					</Dialog.Title>
					<Dialog.Description className="text-kumo-subtle text-sm mb-5">
						Are you sure you want to delete{" "}
						<strong className="text-kumo-default">
							{mailboxToDelete?.email}
						</strong>
						? This action cannot be undone.
					</Dialog.Description>
					<div className="flex justify-end gap-2">
						<Dialog.Close
							render={(props) => (
								<Button {...props} variant="secondary" size="sm">
									Cancel
								</Button>
							)}
						/>
						<Button
							variant="destructive"
							size="sm"
							loading={isDeleting}
							onClick={handleDelete}
						>
							Delete
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</div>
	);
}
