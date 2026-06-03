import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { Link as RouterLink } from "react-router";
import type { MailboxSummary } from "~/types";

interface CardAccount {
	id: string;
	email: string;
	name: string;
	summary?: MailboxSummary;
}

const AVATAR_GRADIENTS = [
	"linear-gradient(135deg, #10b981, #34d399)",
	"linear-gradient(135deg, #ec4899, #f472b6)",
	"linear-gradient(135deg, #84cc16, #a3e635)",
	"linear-gradient(135deg, #f59e0b, #fbbf24)",
	"linear-gradient(135deg, #4f46e5, #818cf8)",
	"linear-gradient(135deg, #0ea5e9, #38bdf8)",
	"linear-gradient(135deg, #ef4444, #f87171)",
	"linear-gradient(135deg, #8b5cf6, #a78bfa)",
];

function getAvatarGradient(email: string): string {
	let hash = 0;
	for (let i = 0; i < email.length; i++) {
		hash = email.charCodeAt(i) + ((hash << 5) - hash);
	}
	return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function getIsActive(summary?: MailboxSummary): boolean {
	const date = summary?.latestEmail?.date;
	if (!date) return false;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const ms = new Date(date as any).getTime();
	return !Number.isNaN(ms) && Date.now() - ms < 7 * 86_400_000;
}

export function HomeMailboxCard({ account, onDelete }: { account: CardAccount; onDelete?: () => void }) {
	const unreadCount = account.summary?.inboxUnreadCount ?? 0;
	const isActive = getIsActive(account.summary);

	return (
		<RouterLink
			to={`/mailbox/${account.id}`}
			className="home-mailbox-card group rounded-xl border border-kumo-line bg-kumo-base p-4 flex flex-col no-underline"
		>
			{/* Card top */}
			<div className="flex items-start gap-3">
				<div
					className="w-11 h-11 rounded-[10px] flex items-center justify-center text-white font-semibold text-base shrink-0 shadow-sm"
					style={{ background: getAvatarGradient(account.email) }}
				>
					{account.name.charAt(0).toUpperCase()}
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="text-sm font-semibold text-kumo-default truncate">{account.name}</span>
						<span
							className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${
								isActive
									? "bg-emerald-100 text-emerald-700"
									: "bg-kumo-fill text-kumo-subtle"
							}`}
						>
							<span
								className={`w-1.5 h-1.5 rounded-full ${
									isActive ? "bg-emerald-500" : "bg-kumo-subtle opacity-50"
								}`}
							/>
							{isActive ? "Active" : "Idle"}
						</span>
					</div>
					<div className="text-xs text-kumo-subtle font-mono truncate mt-0.5">{account.email}</div>
				</div>
				{/* Action button - visible on hover */}
				{onDelete ? (
					<button
						type="button"
						aria-label="Delete mailbox"
						className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-md flex items-center justify-center text-kumo-subtle hover:bg-kumo-fill hover:text-red-500 transition-all shrink-0"
						onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
					>
						<TrashIcon size={14} />
					</button>
				) : (
					<div className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-md flex items-center justify-center text-kumo-subtle hover:bg-kumo-fill transition-all shrink-0">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
							<circle cx="12" cy="12" r="1" />
							<circle cx="19" cy="12" r="1" />
							<circle cx="5" cy="12" r="1" />
						</svg>
					</div>
				)}
			</div>

			{/* Card footer */}
			<div className="mt-4 pt-3 border-t border-kumo-line flex items-center justify-between text-xs">
				<div className="flex items-center gap-1.5 text-kumo-subtle">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
						<rect width="20" height="16" x="2" y="4" rx="2" />
						<path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
					</svg>
					{unreadCount > 0 ? (
						<span>
							<span className="font-semibold text-kumo-default">{unreadCount}</span> unread
						</span>
					) : (
						<span>No emails yet</span>
					)}
				</div>
				<span className="font-medium flex items-center gap-0.5 transition-all" style={{ color: "var(--home-indigo)" }}>
					Open
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
						<path d="m9 18 6-6-6-6" />
					</svg>
				</span>
			</div>
		</RouterLink>
	);
}

export function AddMailboxCard({ domain, onClick }: { domain: string; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="home-add-card rounded-xl border border-dashed border-kumo-line min-h-[120px] w-full flex flex-col items-center justify-center gap-2 text-sm text-kumo-subtle"
		>
			<div className="w-9 h-9 rounded-full border border-dashed border-current flex items-center justify-center">
				<PlusIcon size={16} />
			</div>
			Add mailbox to {domain}
		</button>
	);
}

export function HomeMailboxCardSkeleton() {
	return (
		<div className="rounded-xl border border-kumo-line bg-kumo-base p-4 animate-pulse">
			<div className="flex items-start gap-3 mb-4">
				<div className="w-11 h-11 rounded-[10px] bg-kumo-fill shrink-0" />
				<div className="flex-1 space-y-2 pt-0.5">
					<div className="h-3.5 w-28 rounded bg-kumo-fill" />
					<div className="h-3 w-36 rounded bg-kumo-fill" />
				</div>
			</div>
			<div className="pt-3 border-t border-kumo-line flex justify-between">
				<div className="h-3 w-20 rounded bg-kumo-fill" />
				<div className="h-3 w-10 rounded bg-kumo-fill" />
			</div>
		</div>
	);
}
