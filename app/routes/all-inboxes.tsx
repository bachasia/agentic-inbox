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

const PAGE_SIZE = 25;

export function meta() {
	return [{ title: "All Inboxes — Agentic Inbox" }];
}

export default function AllInboxesRoute() {
	const { data: session } = authClient.useSession();
	const { data: mailboxes = [], isLoading: mailboxesLoading } = useMailboxes();
	const navigate = useNavigate();
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

				<div className="px-6 lg:px-10 pt-8 pb-6">
					<h1 className="text-3xl font-semibold tracking-tight text-kumo-default">All Inboxes</h1>
					<p className="mt-1.5 text-sm text-kumo-subtle">
						All emails across {mailboxes.length} connected mailbox{mailboxes.length !== 1 ? "es" : ""}.
					</p>
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
								{emails.map((email, i) => (
									<button
										key={email.id}
										type="button"
										onClick={() => navigate(`/mailbox/${email.mailboxId}/emails/inbox?email=${email.id}`)}
										className={`w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-kumo-fill transition-colors ${
											i > 0 ? "border-t border-kumo-line" : ""
										}`}
									>
										{/* Mailbox badge */}
										<span className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded bg-kumo-fill border border-kumo-line text-kumo-subtle max-w-[80px] truncate">
											{email.mailboxId.split("@")[0]}
										</span>

										{/* Unread dot */}
										<span
											className={`shrink-0 w-2 h-2 rounded-full ${
												!email.read ? "bg-[var(--home-indigo)]" : "bg-transparent"
											}`}
										/>

										{/* Sender */}
										<span
											className={`shrink-0 w-36 truncate text-sm ${
												!email.read ? "font-semibold text-kumo-default" : "text-kumo-strong"
											}`}
										>
											{email.sender}
										</span>

										{/* Subject + snippet */}
										<span className="flex-1 min-w-0 flex items-center gap-2 truncate">
											<span
												className={`text-sm truncate ${
													!email.read ? "font-medium text-kumo-default" : "text-kumo-strong"
												}`}
											>
												{email.subject}
											</span>
											{email.snippet && (
												<span className="text-sm text-kumo-subtle truncate hidden md:inline">
													— {email.snippet}
												</span>
											)}
										</span>

										{/* Date */}
										<span className="shrink-0 text-xs text-kumo-subtle">
											{email.date ? formatListDate(email.date) : ""}
										</span>
									</button>
								))}
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
