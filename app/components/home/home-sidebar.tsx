import {
	EnvelopeIcon,
	GearSixIcon,
	GlobeIcon,
	ShieldIcon,
	SignOutIcon,
	SquaresFourIcon,
	TrayIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Link as RouterLink, NavLink, useNavigate } from "react-router";
import { authClient } from "~/lib/auth-client";

interface HomeSidebarProps {
	accounts: Array<{ email: string }>;
	activeDomain: string | null;
	onDomainChange: (domain: string | null) => void;
	totalUnread: number;
	user?: { name?: string | null; email?: string | null; role?: string | null } | null;
	isAdmin?: boolean;
}

export default function HomeSidebar({
	accounts,
	activeDomain,
	onDomainChange,
	totalUnread,
	user,
	isAdmin,
}: HomeSidebarProps) {
	const navigate = useNavigate();
	const [menuOpen, setMenuOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const displayName = user?.name ?? user?.email?.split("@")[0] ?? "User";
	const initials = displayName.slice(0, 2).toUpperCase();

	// Close menu on outside click
	useEffect(() => {
		if (!menuOpen) return;
		const handler = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setMenuOpen(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [menuOpen]);

	const handleLogout = async () => {
		setMenuOpen(false);
		await authClient.signOut();
		navigate("/login");
	};

	const navCls = ({ isActive }: { isActive: boolean }) =>
		`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
			isActive
				? "bg-kumo-fill text-kumo-default font-medium"
				: "text-kumo-strong hover:bg-kumo-fill"
		}`;

	const domainCounts: Record<string, number> = {};
	for (const a of accounts) {
		const d = a.email.split("@")[1] ?? "unknown";
		domainCounts[d] = (domainCounts[d] ?? 0) + 1;
	}
	const domains = Object.entries(domainCounts).sort(([a], [b]) => a.localeCompare(b));

	return (
		<aside className="hidden lg:flex w-64 h-screen overflow-y-auto sticky top-0 border-r border-kumo-line bg-kumo-recessed flex-col shrink-0">
			{/* Logo */}
			<div className="flex items-center gap-2 px-5 h-16 border-b border-kumo-line shrink-0">
				<div
					className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
					style={{ background: "var(--home-indigo)" }}
				>
					<EnvelopeIcon size={16} />
				</div>
				<span className="font-semibold tracking-tight text-kumo-default">DTC Inbox</span>
				<span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded bg-kumo-fill text-kumo-subtle">
					PRO
				</span>
			</div>

			{/* Nav */}
			<nav className="p-3 space-y-0.5">
				<NavLink to="/all-inboxes" className={navCls}>
					<TrayIcon size={16} />
					All inboxes
					{totalUnread > 0 && (
						<span className="ml-auto text-[11px] px-1.5 py-0.5 rounded-md bg-kumo-base border border-kumo-line text-kumo-subtle">
							{totalUnread}
						</span>
					)}
				</NavLink>
				<NavLink to="/" end className={navCls}>
					<SquaresFourIcon size={16} />
					Mailboxes
				</NavLink>
				<NavLink to="/domains" className={navCls}>
					<GlobeIcon size={16} />
					Domains
					{domains.length > 0 && (
						<span className="ml-auto text-[11px] px-1.5 py-0.5 rounded-md bg-kumo-base border border-kumo-line text-kumo-subtle">
							{domains.length}
						</span>
					)}
				</NavLink>
				<NavLink to="/settings" className={navCls}>
					<GearSixIcon size={16} />
					Settings
				</NavLink>
			</nav>

			{/* Domain filter */}
			{domains.length > 0 && (
				<div className="px-3 pb-3 space-y-0.5">
					<div className="text-[11px] font-semibold uppercase tracking-wider text-kumo-subtle px-2.5 mb-2">
						Domains
					</div>
					<button
						type="button"
						onClick={() => onDomainChange(null)}
						className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-mono transition-colors ${
							activeDomain === null
								? "bg-kumo-fill text-kumo-default"
								: "text-kumo-subtle hover:bg-kumo-fill hover:text-kumo-strong"
						}`}
					>
						<span className="w-2 h-2 rounded-full border-2 border-current shrink-0" />
						All domains
						<span className="ml-auto opacity-70">{accounts.length}</span>
					</button>
					{domains.map(([domain, count]) => (
						<button
							key={domain}
							type="button"
							onClick={() => onDomainChange(domain)}
							className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-mono transition-colors ${
								activeDomain === domain
									? "bg-kumo-fill text-kumo-default"
									: "text-kumo-subtle hover:bg-kumo-fill hover:text-kumo-strong"
							}`}
						>
							<span className="w-2 h-2 rounded-full border-2 border-current shrink-0" />
							{domain}
							<span className="ml-auto opacity-70">{count}</span>
						</button>
					))}
				</div>
			)}

			{/* User card with popup menu */}
			<div className="mt-auto p-3 shrink-0 relative" ref={menuRef}>
				{/* Popup menu - opens above the card */}
				{menuOpen && (
					<div className="absolute bottom-full left-3 right-3 mb-2 rounded-xl border border-kumo-line bg-kumo-base shadow-lg overflow-hidden">
						{isAdmin && (
							<RouterLink
								to="/admin"
								onClick={() => setMenuOpen(false)}
								className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-kumo-strong hover:bg-kumo-fill transition-colors no-underline"
							>
								<ShieldIcon size={15} />
								Admin
							</RouterLink>
						)}
						<button
							type="button"
							onClick={handleLogout}
							className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-kumo-strong hover:bg-kumo-fill transition-colors border-t border-kumo-line"
						>
							<SignOutIcon size={15} />
							Log out
						</button>
					</div>
				)}

				{/* Clickable user card */}
				<button
					type="button"
					onClick={() => setMenuOpen((o) => !o)}
					className={`w-full rounded-xl border border-kumo-line bg-kumo-base p-3 flex items-center gap-2.5 transition-colors hover:bg-kumo-fill text-left ${menuOpen ? "bg-kumo-fill" : ""}`}
				>
					<div
						className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
						style={{ background: "linear-gradient(135deg, var(--home-indigo), #a855f7)" }}
					>
						{initials}
					</div>
					<div className="min-w-0 flex-1">
						<div className="text-sm font-medium text-kumo-default truncate">{displayName}</div>
						<div className="text-xs text-kumo-subtle truncate">{user?.email ?? ""}</div>
					</div>
				</button>
			</div>
		</aside>
	);
}
