import { EnvelopeIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { formatListDate } from "shared/dates";
import { authClient } from "~/lib/auth-client";
import { useMailboxes } from "~/queries/mailboxes";
import { queryKeys } from "~/queries/keys";
import api from "~/services/api";
import HomeSidebar from "~/components/home/home-sidebar";
import HomeTopBar from "~/components/home/home-top-bar";
import { getSnippetText } from "~/lib/utils";
import { useUIStore } from "~/hooks/useUIStore";

// Stable color per mailbox using a small palette
const BADGE_COLORS = [
	"bg-indigo-500",
	"bg-emerald-500",
	"bg-orange-500",
	"bg-pink-500",
	"bg-sky-500",
	"bg-violet-500",
	"bg-teal-500",
	"bg-rose-500",
];
function mailboxColor(mailboxId: string, mailboxIds: string[]): string {
	const idx = mailboxIds.indexOf(mailboxId);
	return BADGE_COLORS[(idx < 0 ? 0 : idx) % BADGE_COLORS.length];
}

const PAGE_SIZE = 25;

export function meta() {
	return [{ title: "All Inboxes — Agentic Inbox" }];
}

export default function AllInboxesRoute() {
	const { data: session } = authClient.useSession();
	const { data: mailboxes = [], isLoading: mailboxesLoading } = useMailboxes();
	const navigate = useNavigate();
	const { selectEmail } = useUIStore();
	const [page, setPage] = useState(1);

	const { data, isLoading: emailsLoading } = useQuery({
		queryKey: queryKeys.emails.all("inbox", PAGE_SIZE, page),
		queryFn: () => api.getAllEmails("inbox", PAGE_SIZE, page),
	});

	const totalUnread = mailboxes.reduce(
		(s, m) => s + ((m as any).summary?.inboxUnreadCount ?? 0),
		0,
	);
	const isLoading = mailboxesLoading || emailsLoading;
	const emails = data?.emails ?? [];
	const total = data?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
	const mailboxIds = mailboxes.map((m) => m.id);

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
					pageTitle="All Inboxes"
				/>

				<div className="px-6 lg:px-10 pt-8 pb-6 flex items-end justify-between gap-6 flex-wrap">
					<div>
						<h1 className="text-3xl font-semibold tracking-tight text-kumo-default">All Inboxes</h1>
						<p className="mt-1.5 text-sm text-kumo-subtle">
							All emails across {mailboxes.length} connected mailbox{mailboxes.length !== 1 ? "es" : ""}.
						</p>
					</div>
					{!isLoading && total > 0 && (
						<div className="flex items-center gap-2">
							<div className="px-4 py-2 rounded-lg border border-kumo-line bg-kumo-base">
								<div className="text-[11px] uppercase tracking-wider text-kumo-subtle">Mailboxes</div>
								<div className="text-lg font-semibold text-kumo-default">{mailboxes.length}</div>
							</div>
							<div className="px-4 py-2 rounded-lg border border-kumo-line bg-kumo-base">
								<div className="text-[11px] uppercase tracking-wider text-kumo-subtle">Emails</div>
								<div className="text-lg font-semibold text-kumo-default">{total}</div>
							</div>
							{totalUnread > 0 && (
								<div className="px-4 py-2 rounded-lg border border-kumo-line bg-kumo-base"
									style={{ borderColor: "rgba(79,70,229,0.2)", background: "rgba(79,70,229,0.05)" }}>
									<div className="text-[11px] uppercase tracking-wider text-kumo-subtle">Unread</div>
									<div className="text-lg font-semibold" style={{ color: "var(--home-indigo)" }}>{totalUnread}</div>
								</div>
							)}
						</div>
					)}
				</div>

				<div className="px-6 lg:px-10 pb-16">
					{isLoading ? (
						<div className="space-y-2">
							{Array.from({ length: 6 }).map((_, i) => (
								<div key={i} className="h-14 rounded-lg bg-kumo-fill animate-pulse" />
							))}
						</div>
					) : emails.length === 0 ? (
						<div className="rounded-xl border border-kumo-line bg-kumo-base py-16 flex flex-col items-center text-center">
							<EnvelopeIcon size={48} weight="thin" className="text-kumo-subtle mb-4" />
							<h3 className="text-base font-semibold text-kumo-default mb-1.5">No emails</h3>
							<p className="text-sm text-kumo-subtle">Your inboxes are empty.</p>
						</div>
					) : (
						<>
							<div className="rounded-xl border border-kumo-line bg-kumo-base overflow-hidden">
								{emails.map((email, i) => {
									const snippet = getSnippetText(email.snippet, 120);
									const badgeColor = mailboxColor(email.mailboxId, mailboxIds);
									const mailboxLabel = email.mailboxId.split("@")[1] ?? email.mailboxId;
									return (
										<button
											key={email.id}
											type="button"
											onClick={() => {
												selectEmail(email.id);
												navigate(`/mailbox/${encodeURIComponent(email.mailboxId)}/emails/inbox`);
											}}
											className={`w-full px-5 py-3.5 text-left transition-colors relative group cursor-pointer ${
												i > 0 ? "border-t border-kumo-line" : ""
											} hover:bg-kumo-fill`}
											style={!email.read ? { boxShadow: "inset 3px 0 0 var(--home-indigo)" } : undefined}
										>
											{/* Row 1: Subject + date */}
											<div className="flex items-center gap-2 min-w-0">
												{/* Unread dot */}
												<span className={`shrink-0 w-2 h-2 rounded-full ${!email.read ? "bg-[var(--home-indigo)]" : "bg-transparent"}`} />

												{/* Subject — primary */}
												<span className={`flex-1 min-w-0 truncate text-sm ${!email.read ? "font-semibold text-kumo-default" : "font-medium text-kumo-strong"}`}>
													{email.subject || "(no subject)"}
												</span>

												{/* Date */}
												<span className="shrink-0 text-xs text-kumo-subtle ml-2">
													{email.date ? formatListDate(email.date) : ""}
												</span>
											</div>

											{/* Row 2: Mailbox badge + sender + snippet */}
											<div className="flex items-center gap-2 mt-1 min-w-0 pl-4">
												{/* Mailbox badge */}
												<span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded text-white max-w-[200px] truncate ${badgeColor}`}>
													{mailboxLabel}
												</span>

												{/* Sender */}
												<span className="shrink-0 text-xs text-kumo-subtle truncate max-w-[140px]">
													{email.sender}
												</span>

												{/* Snippet */}
												{snippet && (
													<>
														<span className="shrink-0 text-kumo-line">·</span>
														<span className="flex-1 min-w-0 truncate text-xs text-kumo-subtle">
															{snippet}
														</span>
													</>
												)}
											</div>
										</button>
									);
								})}
							</div>

							{totalPages > 1 && (
								<div className="flex items-center justify-between mt-4 text-sm text-kumo-subtle">
									<span>
										{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
									</span>
									<div className="flex gap-2">
										<button
											type="button"
											onClick={() => setPage((p) => Math.max(1, p - 1))}
											disabled={page === 1}
											className="px-3 py-1.5 rounded-lg border border-kumo-line bg-kumo-base hover:bg-kumo-fill disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
										>
											Previous
										</button>
										<button
											type="button"
											onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
											disabled={page === totalPages}
											className="px-3 py-1.5 rounded-lg border border-kumo-line bg-kumo-base hover:bg-kumo-fill disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
										>
											Next
										</button>
									</div>
								</div>
							)}
						</>
					)}
				</div>
			</main>
		</div>
	);
}
