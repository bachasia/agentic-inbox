import { TagIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Button, Tooltip } from "@cloudflare/kumo";
import { useLabels, useApplyLabel, useRemoveLabel } from "~/queries/labels";
import type { Email } from "~/types";

interface LabelPickerProps {
	mailboxId: string;
	email: Email;
}

export function LabelPicker({ mailboxId, email }: LabelPickerProps) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const { data: allLabels = [] } = useLabels(mailboxId);
	const applyLabel = useApplyLabel(mailboxId);
	const removeLabel = useRemoveLabel(mailboxId);

	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	const appliedIds = new Set((email.labels ?? []).map((l) => l.id));

	const toggle = (labelId: string) => {
		if (appliedIds.has(labelId)) {
			removeLabel.mutate({ emailId: email.id, labelId });
		} else {
			applyLabel.mutate({ emailId: email.id, labelId });
		}
	};

	if (allLabels.length === 0) return null;

	return (
		<div ref={ref} className="relative">
			<Tooltip content="Labels" side="bottom" asChild>
				<Button
					variant="ghost"
					shape="square"
					size="sm"
					icon={<TagIcon size={18} />}
					onClick={() => setOpen((o) => !o)}
					aria-label="Apply labels"
				/>
			</Tooltip>
			{open && (
				<div className="absolute top-full left-0 z-50 mt-1 min-w-[180px] rounded-lg border border-kumo-line bg-kumo-elevated shadow-lg py-1">
					<div className="px-3 py-1.5 text-xs font-medium text-kumo-subtle">Labels</div>
					<div className="h-px bg-kumo-line my-1" />
					{allLabels.map((label) => (
						<button
							key={label.id}
							type="button"
							className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-kumo-default hover:bg-kumo-overlay transition-colors"
							onClick={() => toggle(label.id)}
						>
							<span
								className="w-3 h-3 rounded-full border-2 shrink-0 flex items-center justify-center"
								style={{ borderColor: label.color, backgroundColor: appliedIds.has(label.id) ? label.color : "transparent" }}
							/>
							<span
								className="w-2 h-2 rounded-full shrink-0"
								style={{ backgroundColor: label.color }}
							/>
							<span className="flex-1 text-left truncate">{label.name}</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}
