// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { LightningIcon } from "@phosphor-icons/react";
import { memo } from "react";
import MailboxSplitView from "~/components/MailboxSplitView";
import { useUIStore } from "~/hooks/useUIStore";
import { LabelBadge } from "~/components/LabelBadge";
import api from "~/services/api";
import { formatListDate } from "shared/dates";
import { getSnippetText } from "~/lib/utils";
import { queryKeys } from "~/queries/keys";
import type { Email } from "~/types";

const PRIORITY_BORDER: Record<number, string> = {
	4: "border-l-4 border-l-red-500",
	3: "border-l-4 border-l-orange-400",
};

function PriorityBand({ priority }: { priority?: number | null }) {
	if (!priority || priority < 3) return null;
	return <div className={`w-1 self-stretch shrink-0 rounded-sm ${priority === 4 ? "bg-red-500" : "bg-orange-400"}`} />;
}

function CategoryChip({ category }: { category?: string | null }) {
	if (!category) return null;
	return (
		<span className="shrink-0 text-xs text-kumo-subtle bg-kumo-fill rounded px-1.5 py-0.5 ml-1 capitalize">
			{category}
		</span>
	);
}

interface PriorityRowProps {
	email: Email;
	isSelected: boolean;
	onSelect: (id: string) => void;
}

// Memoized row: only re-renders when isSelected or email data changes
const PriorityRow = memo(function PriorityRow({ email, isSelected, onSelect }: PriorityRowProps) {
	const snippet = getSnippetText(email.snippet);
	const isUnread = !email.read;
	return (
		<div
			role="button"
			tabIndex={0}
			onClick={() => onSelect(email.id)}
			onKeyDown={(e) => { if (e.key === "Enter") onSelect(email.id); }}
			className={`flex items-stretch gap-0 w-full text-left cursor-pointer border-b border-kumo-line transition-colors ${isSelected ? "bg-kumo-tint" : "hover:bg-kumo-tint"}`}
		>
			<PriorityBand priority={email.triage_priority} />
			<div className="flex items-center gap-3 flex-1 px-4 py-2.5 md:px-5 md:py-3">
				<div className="w-2.5 shrink-0 flex justify-center">
					{isUnread && <div className="h-2 w-2 rounded-full bg-kumo-brand" />}
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className={`truncate text-sm ${isUnread ? "font-semibold text-kumo-default" : "text-kumo-strong"}`}>
							{email.sender.split("@")[0]}
						</span>
						<CategoryChip category={email.triage_category} />
						<span className="text-sm text-kumo-subtle shrink-0 ml-auto">{formatListDate(email.date)}</span>
					</div>
					<div className="truncate text-sm mt-0.5">
						<span className={isUnread ? "font-medium text-kumo-default" : "text-kumo-subtle"}>
							{email.subject}
						</span>
						{snippet && (
							<span className="text-kumo-subtle font-normal">{" "}&mdash; {snippet}</span>
						)}
					</div>
					{email.triage_summary && (
						<div className="text-xs text-kumo-subtle italic mt-0.5 truncate">{email.triage_summary}</div>
					)}
					{email.labels && email.labels.length > 0 && (
						<div className="flex items-center gap-1 mt-1 flex-wrap">
							{email.labels.map((label) => (
								<LabelBadge key={label.id} label={label} size="xs" />
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
});

export default function PriorityInboxRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	// selectEmail is a stable Zustand action — no useCallback needed
	const { selectedEmailId, isComposing, selectEmail } = useUIStore();

	const { data } = useQuery({
		queryKey: queryKeys.priorityInbox.list(mailboxId!),
		queryFn: () => api.listPriorityInbox(mailboxId!),
		enabled: !!mailboxId,
		refetchInterval: 30_000,
	});
	const emails: Email[] = (data as any)?.emails ?? [];

	return (
		<MailboxSplitView selectedEmailId={selectedEmailId} isComposing={isComposing}>
			<div className="flex items-center justify-between px-4 py-3.5 border-b border-kumo-line shrink-0 md:px-5">
				<h1 className="text-lg font-semibold text-kumo-default flex items-center gap-2">
					<LightningIcon size={20} weight="fill" className="text-kumo-warning" />
					Priority Inbox
				</h1>
			</div>
			<div className="flex-1 overflow-y-auto">
				{emails.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-24 px-6 text-center">
						<LightningIcon size={48} weight="thin" className="text-kumo-subtle mb-4" />
						<h3 className="text-base font-semibold text-kumo-default mb-1.5">No priority emails</h3>
						<p className="text-sm text-kumo-subtle max-w-xs">High-priority emails will appear here once AI triage processes them.</p>
					</div>
				) : emails.map((email) => (
					<PriorityRow
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
