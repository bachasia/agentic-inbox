import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { TimerIcon } from "@phosphor-icons/react";
import MailboxSplitView from "~/components/MailboxSplitView";
import { useUIStore } from "~/hooks/useUIStore";
import api from "~/services/api";
import { formatListDate } from "shared/dates";
import type { Email } from "~/types";

export default function ScheduledEmailsRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const { selectedEmailId, isComposing, selectEmail } = useUIStore();

	const { data } = useQuery({
		queryKey: ["mailboxes", mailboxId, "scheduled"],
		queryFn: () => api.listScheduled(mailboxId!),
		enabled: !!mailboxId,
	});
	const emails: Email[] = (data as any)?.emails ?? [];

	return (
		<MailboxSplitView selectedEmailId={selectedEmailId} isComposing={isComposing}>
			<div className="flex items-center justify-between px-4 py-3.5 border-b border-kumo-line shrink-0 md:px-5">
				<h1 className="text-lg font-semibold text-kumo-default">Scheduled</h1>
			</div>
			<div className="flex-1 overflow-y-auto">
				{emails.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-24 px-6 text-center">
						<TimerIcon size={48} weight="thin" className="text-kumo-subtle mb-4" />
						<h3 className="text-base font-semibold text-kumo-default mb-1.5">No scheduled emails</h3>
						<p className="text-sm text-kumo-subtle max-w-xs">Emails you schedule to send later will appear here.</p>
					</div>
				) : emails.map((email) => (
					<div
						key={email.id}
						role="button"
						tabIndex={0}
						onClick={() => selectEmail(email.id)}
						onKeyDown={(e) => { if (e.key === "Enter") selectEmail(email.id); }}
						className={`flex items-center gap-3 w-full text-left cursor-pointer border-b border-kumo-line px-4 py-2.5 md:px-6 md:py-3 hover:bg-kumo-tint ${selectedEmailId === email.id ? "bg-kumo-tint" : ""}`}
					>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<span className="truncate text-sm font-medium text-kumo-default">{email.recipient}</span>
								<span className="text-sm text-kumo-subtle shrink-0 ml-auto">{formatListDate(email.date)}</span>
							</div>
							<div className="truncate text-sm text-kumo-subtle mt-0.5">{email.subject}</div>
							{email.scheduled_send_at && (
								<div className="text-xs text-kumo-accent mt-0.5">
									Sends at {new Date(email.scheduled_send_at).toLocaleString()}
								</div>
							)}
						</div>
					</div>
				))}
			</div>
		</MailboxSplitView>
	);
}
