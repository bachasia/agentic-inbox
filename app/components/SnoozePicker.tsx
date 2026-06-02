import { AlarmIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Button, Tooltip } from "@cloudflare/kumo";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";

interface SnoozePickerProps {
	mailboxId: string;
	emailId: string;
	snoozeUntil?: string | null;
	onSnoozed?: () => void;
}

function quickPickTimes(): Array<{ label: string; date: Date }> {
	const now = new Date();
	const tonight = new Date(now);
	tonight.setHours(18, 0, 0, 0);
	if (tonight <= now) tonight.setDate(tonight.getDate() + 1);

	const tomorrow9 = new Date(now);
	tomorrow9.setDate(now.getDate() + 1);
	tomorrow9.setHours(9, 0, 0, 0);

	const nextWeek = new Date(now);
	nextWeek.setDate(now.getDate() + 7);
	nextWeek.setHours(9, 0, 0, 0);

	const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);

	return [
		{ label: "In 1 hour", date: inOneHour },
		{ label: "Tonight 6pm", date: tonight },
		{ label: "Tomorrow 9am", date: tomorrow9 },
		{ label: "Next week", date: nextWeek },
	];
}

export function SnoozePicker({ mailboxId, emailId, snoozeUntil, onSnoozed }: SnoozePickerProps) {
	const [open, setOpen] = useState(false);
	const [custom, setCustom] = useState("");
	const ref = useRef<HTMLDivElement>(null);
	const qc = useQueryClient();

	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	const snoozeMut = useMutation({
		mutationFn: (until: string) => api.snoozeEmail(mailboxId, emailId, until),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["emails", mailboxId] });
			setOpen(false);
			onSnoozed?.();
		},
	});

	const unsnoozeMut = useMutation({
		mutationFn: () => api.unsnoozeEmail(mailboxId, emailId),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["emails", mailboxId] });
			setOpen(false);
		},
	});

	const snooze = (date: Date) => snoozeMut.mutate(date.toISOString());

	const isActive = snoozeMut.isPending || unsnoozeMut.isPending;

	return (
		<div ref={ref} className="relative">
			<Tooltip content={snoozeUntil ? "Snoozed" : "Snooze"} side="bottom" asChild>
				<Button
					variant="ghost"
					shape="square"
					size="sm"
					icon={<AlarmIcon size={18} weight={snoozeUntil ? "fill" : "regular"} className={snoozeUntil ? "text-kumo-accent" : ""} />}
					onClick={() => setOpen((o) => !o)}
					aria-label="Snooze email"
				/>
			</Tooltip>
			{open && (
				<div className="absolute top-full left-0 z-50 mt-1 w-52 rounded-lg border border-kumo-line bg-kumo-elevated shadow-lg py-1">
					<div className="px-3 py-1.5 text-xs font-medium text-kumo-subtle">Snooze until</div>
					<div className="h-px bg-kumo-line my-1" />
					{quickPickTimes().map(({ label, date }) => (
						<button
							key={label}
							type="button"
							disabled={isActive}
							className="w-full text-left px-3 py-1.5 text-sm text-kumo-default hover:bg-kumo-overlay transition-colors disabled:opacity-50"
							onClick={() => snooze(date)}
						>
							{label}
						</button>
					))}
					<div className="px-3 py-2 space-y-1.5">
						<div className="h-px bg-kumo-line -mx-3 mb-2" />
						<input
							type="datetime-local"
							value={custom}
							onChange={(e) => setCustom(e.target.value)}
							className="w-full text-xs border border-kumo-line rounded px-2 py-1 bg-kumo-base text-kumo-default"
						/>
						<Button
							variant="primary"
							size="sm"
							className="w-full"
							disabled={!custom || isActive}
							onClick={() => custom && snooze(new Date(custom))}
						>
							Snooze
						</Button>
					</div>
					{snoozeUntil && (
						<>
							<div className="h-px bg-kumo-line mx-3 my-1" />
							<button
								type="button"
								disabled={isActive}
								className="w-full text-left px-3 py-1.5 text-sm text-kumo-danger hover:bg-kumo-overlay transition-colors disabled:opacity-50"
								onClick={() => unsnoozeMut.mutate()}
							>
								Cancel snooze
							</button>
						</>
					)}
				</div>
			)}
		</div>
	);
}
