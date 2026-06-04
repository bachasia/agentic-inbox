// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Pagination, Tooltip } from "@cloudflare/kumo";
import {
	ArchiveIcon,
	ArrowBendUpLeftIcon,
	ArrowsClockwiseIcon,
	EnvelopeOpenIcon,
	EnvelopeSimpleIcon,
	FileIcon,
	PaperPlaneTiltIcon,
	PencilSimpleIcon,
	StarIcon,
	TrashIcon,
	TrayIcon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { Folders } from "shared/folders";
import { formatListDate } from "shared/dates";
import MailboxSplitView from "~/components/MailboxSplitView";
import { LabelBadge } from "~/components/LabelBadge";
import { SwipeableEmailRow } from "~/components/SwipeableEmailRow";
import { getAvatarGradient, getSnippetText } from "~/lib/utils";
import {
	useDeleteEmail,
	useEmails,
	useMarkThreadRead,
	useMoveEmail,
	useUpdateEmail,
} from "~/queries/emails";
import { useFolders } from "~/queries/folders";
import { queryKeys } from "~/queries/keys";
import { useUIStore } from "~/hooks/useUIStore";
import type { Email } from "~/types";

const PAGE_SIZE = 25;

const FOLDER_EMPTY_STATES: Record<
	string,
	{
		icon: React.ReactNode;
		title: string;
		description: string;
		showCompose?: boolean;
	}
> = {
	[Folders.INBOX]: {
		icon: <TrayIcon size={48} weight="thin" className="text-kumo-subtle" />,
		title: "Your inbox is empty",
		description:
			"New emails will appear here when they arrive. Send an email to get the conversation started.",
		showCompose: true,
	},
	[Folders.SENT]: {
		icon: (
			<PaperPlaneTiltIcon size={48} weight="thin" className="text-kumo-subtle" />
		),
		title: "No sent emails",
		description: "Emails you send will show up here.",
		showCompose: true,
	},
	[Folders.DRAFT]: {
		icon: <FileIcon size={48} weight="thin" className="text-kumo-subtle" />,
		title: "No drafts",
		description: "Emails you're still working on will be saved here.",
		showCompose: true,
	},
	[Folders.ARCHIVE]: {
		icon: <ArchiveIcon size={48} weight="thin" className="text-kumo-subtle" />,
		title: "Archive is empty",
		description:
			"Move emails here to keep your inbox clean without deleting them.",
	},
	[Folders.TRASH]: {
		icon: <TrashIcon size={48} weight="thin" className="text-kumo-subtle" />,
		title: "Trash is empty",
		description:
			"Deleted emails will appear here. You can restore them or permanently delete them.",
	},
};

function EmailListSkeleton() {
	return (
		<div className="animate-pulse space-y-1 p-2">
			{Array.from({ length: 8 }).map((_, i) => (
				<div key={i} className="flex items-center gap-3 px-3 py-3">
					<div className="w-4 h-4 rounded bg-kumo-fill" />
					<div className="w-5 h-5 rounded bg-kumo-fill" />
					<div className="flex-1 space-y-2">
						<div className="flex items-center gap-2">
							<div className="h-3 w-24 rounded bg-kumo-fill" />
							<div className="h-3 w-4 rounded bg-kumo-fill" />
							<div className="h-3 flex-1 rounded bg-kumo-fill" />
							<div className="h-3 w-12 rounded bg-kumo-fill" />
						</div>
						<div className="h-2.5 w-3/4 rounded bg-kumo-fill" />
					</div>
				</div>
			))}
		</div>
	);
}

function FolderEmptyState({
	folder,
	onCompose,
}: {
	folder?: string;
	onCompose: () => void;
}) {
	const config = (folder && FOLDER_EMPTY_STATES[folder]) || {
		icon: (
			<EnvelopeSimpleIcon size={48} weight="thin" className="text-kumo-subtle" />
		),
		title: "No emails",
		description: "This folder is empty.",
	};

	return (
		<div className="flex flex-col items-center justify-center py-24 px-6 text-center">
			<div className="mb-4">{config.icon}</div>
			<h3 className="text-base font-semibold text-kumo-default mb-1.5">
				{config.title}
			</h3>
			<p className="text-sm text-kumo-subtle max-w-xs mb-5">
				{config.description}
			</p>
			{"showCompose" in config && config.showCompose && (
				<Button
					variant="primary"
					size="sm"
					icon={<PencilSimpleIcon size={16} />}
					onClick={onCompose}
				>
					Compose
				</Button>
			)}
		</div>
	);
}

export default function EmailListRoute() {
	const { mailboxId, folder } = useParams<{
		mailboxId: string;
		folder: string;
	}>();
	const {
		selectedEmailId,
		isComposing,
		selectEmail,
		closePanel,
		startCompose,
	} = useUIStore();
	const [page, setPage] = useState(1);
	const [searchParams] = useSearchParams();
	const labelId = searchParams.get("label") ?? undefined;

	const queryClient = useQueryClient();
	const updateEmail = useUpdateEmail();
	const markThreadRead = useMarkThreadRead();
	const deleteEmail = useDeleteEmail();
	const moveEmail = useMoveEmail();

	const params = useMemo(
		() => ({
			folder: folder || "",
			page: String(page),
			limit: String(PAGE_SIZE),
			...(labelId ? { label_id: labelId } : {}),
		}),
		[folder, page, labelId],
	);

	const {
		data: emailData,
		isFetching: isRefreshing,
	} = useEmails(mailboxId, params, { refetchInterval: 30_000 });

	const emails = emailData?.emails ?? [];
	const totalCount = emailData?.totalCount ?? 0;

	const { data: folders = [] } = useFolders(mailboxId);

	const folderName = useMemo(() => {
		const found = folders.find((f) => f.id === folder);
		if (found) return found.name;
		return folder ? folder.charAt(0).toUpperCase() + folder.slice(1) : "Inbox";
	}, [folders, folder]);

	const isPanelOpen = selectedEmailId !== null || isComposing;

	// Track folder identity to detect folder changes vs page changes
	const prevFolderRef = useRef<string | undefined>(undefined);

	useEffect(() => {
		const folderChanged = prevFolderRef.current !== `${mailboxId}/${folder}`;
		prevFolderRef.current = `${mailboxId}/${folder}`;

		if (folderChanged) {
			closePanel();
			setPage(1);
		}
	}, [mailboxId, folder, closePanel]);

	const toggleStar = (e: React.MouseEvent, email: Email) => {
		e.preventDefault();
		e.stopPropagation();
		if (mailboxId)
			updateEmail.mutate({
				mailboxId,
				id: email.id,
				data: { starred: !email.starred },
			});
	};

	const handleDelete = (e: React.MouseEvent, emailId: string) => {
		e.preventDefault();
		e.stopPropagation();
		if (mailboxId) {
			const confirmed = window.confirm("Are you sure you want to delete this email?");
			if (!confirmed) return;
			deleteEmail.mutate({ mailboxId, id: emailId });
			if (selectedEmailId === emailId) closePanel();
		}
	};

	const handleRefresh = () => {
		if (mailboxId) {
			queryClient.invalidateQueries({ queryKey: ["emails", mailboxId] });
			queryClient.invalidateQueries({
				queryKey: queryKeys.folders.list(mailboxId),
			});
		}
	};

	// Thread-aware helpers
	const hasUnread = (email: Email): boolean => {
		if (email.thread_unread_count !== undefined) {
			return email.thread_unread_count > 0;
		}
		return !email.read;
	};

	const handleRowClick = (email: Email) => {
		selectEmail(email.id);
		if (mailboxId && hasUnread(email)) {
			if (email.thread_id && email.thread_count && email.thread_count > 1) {
				markThreadRead.mutate({
					mailboxId,
					threadId: email.thread_id,
				});
			} else {
				updateEmail.mutate({
					mailboxId,
					id: email.id,
					data: { read: true },
				});
			}
		}
	};

	const formatParticipants = (email: Email): string => {
		if (email.participants) {
			const names = email.participants
				.split(",")
				.map((p) => p.trim().split("@")[0])
				.filter((name, idx, arr) => arr.indexOf(name) === idx);
			if (names.length <= 3) return names.join(", ");
			return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
		}
		return email.sender.split("@")[0];
	};

	return (
		<MailboxSplitView
			selectedEmailId={selectedEmailId}
			isComposing={isComposing}
		>
				{/* Folder header */}
				<div className="flex items-center justify-between px-4 py-3.5 border-b border-kumo-line shrink-0 md:px-5">
					<h1 className="text-lg font-semibold text-kumo-default">
						{folderName}
					</h1>
					<div className="flex items-center gap-1">
						{totalCount > 0 && (
							<span className="text-sm text-kumo-subtle mr-2 hidden sm:inline">
								{totalCount} conversation{totalCount !== 1 ? "s" : ""}
							</span>
						)}
						<Tooltip
							content={isRefreshing ? "Refreshing..." : "Refresh"}
							side="bottom"
							asChild
						>
							<Button
								variant="ghost"
								shape="square"
								size="sm"
								icon={
									<ArrowsClockwiseIcon
										size={18}
										className={isRefreshing ? "animate-spin" : ""}
									/>
								}
								onClick={handleRefresh}
								disabled={isRefreshing}
								aria-label="Refresh"
							/>
						</Tooltip>
					</div>
				</div>

				{/* Email rows */}
				<div className="flex-1 overflow-y-auto">
				{isRefreshing && emails.length === 0 ? (
					<EmailListSkeleton />
				) : emails.length > 0 ? (
						<div>
							{emails.map((email) => {
								const isSelected = selectedEmailId === email.id;
								const snippet = getSnippetText(email.snippet);
								return (
									<SwipeableEmailRow
										key={email.id}
										onSwipeRight={() => mailboxId && moveEmail.mutate({ mailboxId, id: email.id, folderId: "archive" })}
										onSwipeLeft={() => {
											if (mailboxId && window.confirm("Delete this email?")) {
												moveEmail.mutate({ mailboxId, id: email.id, folderId: "trash" });
											}
										}}
									>
									<div
										role="button"
										tabIndex={0}
										onClick={() => handleRowClick(email)}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												handleRowClick(email);
											}
										}}
										className={`group flex items-stretch gap-0 w-full text-left cursor-pointer transition-colors border-b border-kumo-line ${
											isSelected ? "bg-kumo-tint" : "hover:bg-kumo-tint"
										}`}
									>
										{/* Left accent bar: brand when selected, priority colors otherwise */}
										<div className={`w-[3px] shrink-0 self-stretch ${
											isSelected
												? "bg-kumo-brand"
												: email.triage_priority && email.triage_priority >= 3
													? email.triage_priority >= 4 ? "bg-red-500" : "bg-orange-400"
													: ""
										}`} />

										<div className={`flex items-start gap-2.5 flex-1 px-3 py-3 ${isPanelOpen ? "md:py-2.5" : ""}`}>
											{/* Gradient avatar */}
											<div
												className="size-8 rounded-lg text-xs text-white font-semibold flex items-center justify-center shrink-0 mt-0.5 select-none"
												style={{ background: getAvatarGradient(formatParticipants(email)) }}
											>
												{formatParticipants(email)[0]?.toUpperCase() ?? "?"}
											</div>

											{/* Content */}
											<div className="min-w-0 flex-1">
												{/* Line 1: sender + indicators + time */}
												<div className="flex items-center gap-1.5">
													<span className={`text-sm truncate ${hasUnread(email) ? "font-semibold text-kumo-default" : "font-medium text-kumo-strong"}`}>
														{formatParticipants(email)}
													</span>
													{email.starred && (
														<StarIcon size={12} weight="fill" className="text-kumo-warning shrink-0" />
													)}
													{(email.thread_count ?? 1) > 1 && (
														<span className="shrink-0 text-xs text-kumo-subtle bg-kumo-fill rounded-full px-1.5 py-0.5 font-medium">
															{email.thread_count}
														</span>
													)}
													{email.has_draft && (
														<span className="shrink-0 text-xs text-kumo-destructive font-medium">Draft</span>
													)}
													{email.needs_reply && !email.has_draft && (
														<Tooltip content="Needs reply" asChild>
															<span className="shrink-0 text-kumo-warning">
																<ArrowBendUpLeftIcon size={12} weight="bold" />
															</span>
														</Tooltip>
													)}
													<span className="ml-auto text-xs text-kumo-subtle shrink-0 flex items-center gap-1">
														{email.triage_category && (
															<span className="bg-kumo-fill rounded px-1.5 py-0.5 capitalize hidden sm:inline text-[10px]">
																{email.triage_category}
															</span>
														)}
														{formatListDate(email.date)}
													</span>
												</div>

												{/* Line 2: subject */}
												<div className={`text-xs truncate mt-0.5 ${hasUnread(email) ? "font-medium text-kumo-default" : "text-kumo-subtle"}`}>
													{email.subject}
												</div>

												{/* Line 3: snippet preview */}
												{snippet && (
													<div className="text-[11px] text-kumo-subtle truncate mt-0.5">{snippet}</div>
												)}

												{/* AI thread summary */}
												{email.triage_summary && (email.thread_count ?? 1) >= 3 && (
													<div className="text-xs text-kumo-subtle italic mt-0.5 truncate">{email.triage_summary}</div>
												)}

												{/* Label badges */}
												{email.labels && email.labels.length > 0 && (
													<div className="flex items-center gap-1 mt-1.5 flex-wrap">
														{email.labels.map((label) => (
															<LabelBadge key={label.id} label={label} size="xs" />
														))}
													</div>
												)}
												{email.snooze_until && (
													<div className="mt-1 text-xs text-kumo-accent">
														Snoozed until {new Date(email.snooze_until).toLocaleString()}
													</div>
												)}
												{email.scheduled_send_at && (
													<div className="mt-1 text-xs text-kumo-subtle">
														Sends at {new Date(email.scheduled_send_at).toLocaleString()}
													</div>
												)}
											</div>

											{/* Right column: unread dot + hover actions */}
											<div className="flex flex-col items-center gap-1.5 shrink-0">
												<div className="size-2 mt-1.5">
													{hasUnread(email) && <div className="size-2 rounded-full bg-kumo-brand" />}
												</div>
												<div className="hidden group-hover:flex flex-col gap-0.5">
													<Tooltip content={email.starred ? "Unstar" : "Star"} asChild>
														<Button
															variant="ghost"
															shape="square"
															size="sm"
															icon={<StarIcon size={13} weight={email.starred ? "fill" : "regular"} className={email.starred ? "text-kumo-warning" : ""} />}
															onClick={(e) => { e.stopPropagation(); toggleStar(e, email); }}
															aria-label={email.starred ? "Unstar" : "Star"}
														/>
													</Tooltip>
													<Tooltip content={email.read ? "Mark unread" : "Mark read"} asChild>
														<Button
															variant="ghost"
															shape="square"
															size="sm"
															icon={email.read ? <EnvelopeSimpleIcon size={13} /> : <EnvelopeOpenIcon size={13} />}
															onClick={(e) => {
																e.stopPropagation();
																if (mailboxId)
																	updateEmail.mutate({ mailboxId, id: email.id, data: { read: !email.read } });
															}}
															aria-label={email.read ? "Mark unread" : "Mark read"}
														/>
													</Tooltip>
													<Tooltip content="Delete" asChild>
														<Button
															variant="ghost"
															shape="square"
															size="sm"
															icon={<TrashIcon size={13} />}
															onClick={(e) => handleDelete(e, email.id)}
															aria-label="Delete"
														/>
													</Tooltip>
												</div>
											</div>
										</div>
									</div>
									</SwipeableEmailRow>
								);
							})}
						</div>
					) : (
						<FolderEmptyState
							folder={folder}
							onCompose={() => startCompose()}
						/>
					)}
				</div>

				{/* Pagination */}
				{totalCount > PAGE_SIZE && (
					<div className="flex justify-center py-3 border-t border-kumo-line shrink-0">
						<Pagination
							page={page}
							setPage={setPage}
							perPage={PAGE_SIZE}
							totalCount={totalCount}
						/>
					</div>
				)}
		</MailboxSplitView>
	);
}
