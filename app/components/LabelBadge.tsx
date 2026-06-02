import { XIcon } from "@phosphor-icons/react";
import type { Label } from "~/types";

interface LabelBadgeProps {
	label: Label;
	onRemove?: () => void;
	size?: "sm" | "xs";
}

export function LabelBadge({ label, onRemove, size = "sm" }: LabelBadgeProps) {
	const textSize = size === "xs" ? "text-[10px]" : "text-xs";
	const padding = size === "xs" ? "px-1.5 py-0.5" : "px-2 py-0.5";

	return (
		<span
			className={`inline-flex items-center gap-1 rounded-full font-medium ${textSize} ${padding}`}
			style={{
				backgroundColor: `${label.color}26`,
				color: label.color,
				border: `1px solid ${label.color}40`,
			}}
		>
			{label.name}
			{onRemove && (
				<button
					type="button"
					onClick={(e) => { e.stopPropagation(); onRemove(); }}
					className="hover:opacity-70 transition-opacity"
					aria-label={`Remove label ${label.name}`}
				>
					<XIcon size={10} />
				</button>
			)}
		</span>
	);
}
