import { MagnifyingGlassIcon, PlusIcon } from "@phosphor-icons/react";
import ThemeToggleButton from "~/components/theme-toggle-button";

interface HomeTopBarProps {
	searchQuery: string;
	onSearchChange: (q: string) => void;
	onNewMailbox: () => void;
	showNewMailbox: boolean;
	pageTitle?: string;
}

export default function HomeTopBar({
	searchQuery,
	onSearchChange,
	onNewMailbox,
	showNewMailbox,
	pageTitle = "Mailboxes",
}: HomeTopBarProps) {
	return (
		<div className="sticky top-0 z-10 bg-kumo-base border-b border-kumo-line h-16">
			<div className="flex items-center gap-3 px-6 lg:px-10 h-full">
				{/* Breadcrumb */}
				<div className="flex items-center gap-2 text-sm text-kumo-subtle">
					<span>Workspace</span>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						aria-hidden="true"
					>
						<path d="m9 18 6-6-6-6" />
					</svg>
					<span className="text-kumo-default font-medium">{pageTitle}</span>
				</div>

				{/* Actions */}
				<div className="ml-auto flex items-center gap-2">
					<div className="relative hidden md:block">
						<MagnifyingGlassIcon
							size={15}
							className="absolute left-3 top-1/2 -translate-y-1/2 text-kumo-subtle pointer-events-none"
						/>
						<input
							type="text"
							placeholder="Search mailboxes..."
							value={searchQuery}
							onChange={(e) => onSearchChange(e.target.value)}
							className="h-9 w-64 pl-9 pr-3 rounded-lg border border-kumo-line bg-kumo-recessed text-sm text-kumo-default placeholder:text-kumo-subtle outline-none transition-all focus:border-[var(--home-indigo)] focus:ring-2 focus:ring-[rgba(79,70,229,0.1)]"
						/>
					</div>
					<ThemeToggleButton />
					{showNewMailbox && (
						<button
							type="button"
							onClick={onNewMailbox}
							className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 cursor-pointer"
							style={{ background: "var(--home-indigo)" }}
						>
							<PlusIcon size={15} />
							<span className="hidden sm:inline">New Mailbox</span>
							<span className="sm:hidden">New</span>
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
