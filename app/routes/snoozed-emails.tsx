import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { HourglassIcon } from "@phosphor-icons/react";
import { memo } from "react";
import MailboxSplitView from "~/components/MailboxSplitView";
import { useUIStore } from "~/hooks/useUIStore";
import api from "~/services/api";
import { formatListDate } from "shared/dates";
import type { Email } from "~/types";

interface SnoozedRowProps {
	email: Email;
	isSelected: boolean;
	onSelect: (id: string) => void;
}

// Memoized row: only re-renders when isSelected or email data changes
const SnoozedRow = memo(function SnoozedRow({ email, isSelected, onSelect }: SnoozedRowProps) {
	return (
		<div
			role="button"
			tabIndex={0}
			onClick={() => onSelect(email.id)}
			onKeyDown={(e) => { if (e.key === "Enter") onSelect(email.id); }}
			className={`flex items-center gap-3 w-full text-left cursor-pointer border-b border-kumo-line px-4 py-2.5 md:px-6 md:py-3 hover:bg-kumo-tint ${isSelected ? "bg-kumo-tint" : ""}`}
		>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate text-sm font-medium text-kumo-default">{email.sender}</span>
					<span className="text-sm text-kumo-subtle shrink-0 ml-auto">{formatListDate(email.date)}</span>
				</div>
				<div className="truncate text-sm text-kumo-subtle mt-0.5">{email.subject}</div>
				{email.snooze_until && (
					<div className="text-xs text-kumo-accent mt-0.5">
						Returns {new Date(email.snooze_until).toLocaleString()}
					</div>
				)}
			</div>
		</div>
	);
});

export default function SnoozedEmailsRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	// selectEmail is a stable Zustand action — no useCallback needed
	const { selectedEmailId, isComposing, selectEmail } = useUIStore();

	const { data, isLoading: emailsLoading } = useQuery({
		queryKey: ["mailboxes", mailboxId, "snoozed"],
		queryFn: () => api.listSnoozed(mailboxId!),
		enabled: !!mailboxId,
	});
	const emails: Email[] = (data as any)?.emails ?? [];

	return (
		<MailboxSplitView selectedEmailId={selectedEmailId} isComposing={isComposing}>
			<div className="flex items-center justify-between px-4 py-3.5 border-b border-kumo-line shrink-0 md:px-5">
				<h1 className="text-lg font-semibold text-kumo-default">Snoozed</h1>
			</div>
			<div className="flex-1 overflow-y-auto">
				{emailsLoading ? null : emails.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-24 px-6 text-center">
						<HourglassIcon size={48} weight="thin" className="text-kumo-subtle mb-4" />
						<h3 className="text-base font-semibold text-kumo-default mb-1.5">No snoozed emails</h3>
						<p className="text-sm text-kumo-subtle max-w-xs">Emails you snooze will appear here until their reminder time.</p>
					</div>
				) : emails.map((email) => (
					<SnoozedRow
						key={email.id}
						email={email}
						isSelected={selectedEmailId === email.id}
						onSelect={selectEmail}
					/>
				))}
			</div>
		</MailboxSplitView>
	);
}
