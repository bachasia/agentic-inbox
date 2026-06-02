import { XIcon } from "@phosphor-icons/react";
import { useUIStore } from "~/hooks/useUIStore";

const SHORTCUTS = [
	{ key: "j / k", action: "Next / Previous email" },
	{ key: "e", action: "Archive" },
	{ key: "#", action: "Delete" },
	{ key: "r", action: "Reply" },
	{ key: "f", action: "Forward" },
	{ key: "s", action: "Toggle star" },
	{ key: "u", action: "Mark unread" },
	{ key: "c", action: "Compose" },
	{ key: "/", action: "Search" },
	{ key: "?", action: "This help" },
	{ key: "Esc", action: "Close panel" },
];

export function ShortcutsHelpModal() {
	const { isShortcutsModalOpen, closeShortcutsModal } = useUIStore();
	if (!isShortcutsModalOpen) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
			onClick={closeShortcutsModal}
			onKeyDown={(e) => e.key === "Escape" && closeShortcutsModal()}
			role="dialog"
			aria-modal="true"
			aria-label="Keyboard shortcuts"
			tabIndex={-1}
		>
			<div
				className="bg-kumo-elevated border border-kumo-line rounded-xl shadow-xl w-80 p-5"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-sm font-semibold text-kumo-default">Keyboard shortcuts</h2>
					<button
						type="button"
						onClick={closeShortcutsModal}
						className="text-kumo-subtle hover:text-kumo-default transition-colors"
						aria-label="Close"
					>
						<XIcon size={16} />
					</button>
				</div>
				<div className="space-y-1">
					{SHORTCUTS.map(({ key, action }) => (
						<div key={key} className="flex items-center justify-between py-1">
							<kbd className="px-1.5 py-0.5 text-xs font-mono bg-kumo-recessed border border-kumo-line rounded text-kumo-strong">
								{key}
							</kbd>
							<span className="text-sm text-kumo-subtle">{action}</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
