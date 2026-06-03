// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import type { ContactIntelligence } from "~/types";

interface ContactIntelligencePanelProps {
	intelligence: ContactIntelligence;
	contactEmail: string;
}

function RelationshipGauge({ score }: { score: number }) {
	const pct = Math.min(100, Math.max(0, score));
	const color = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-400" : "bg-kumo-muted";
	return (
		<div className="flex items-center gap-2">
			<div className="flex-1 h-1.5 bg-kumo-line rounded-full overflow-hidden">
				<div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
			</div>
			<span className="text-xs text-kumo-muted tabular-nums w-7 text-right">{pct}</span>
		</div>
	);
}

function StatRow({ label, value }: { label: string; value: string | number | null }) {
	if (value === null || value === undefined) return null;
	return (
		<div className="flex justify-between items-center text-sm py-1">
			<span className="text-kumo-muted">{label}</span>
			<span className="text-kumo-default font-medium">{value}</span>
		</div>
	);
}

function formatResponseTime(hours: number | null): string {
	if (hours === null) return "—";
	if (hours < 1) return "< 1h";
	if (hours < 24) return `${Math.round(hours)}h`;
	return `${Math.round(hours / 24)}d`;
}

export default function ContactIntelligencePanel({ intelligence, contactEmail }: ContactIntelligencePanelProps) {
	const lastContactDate = intelligence.lastContact
		? new Date(intelligence.lastContact).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
		: null;

	return (
		<div className="rounded-lg border border-kumo-line bg-kumo-subtle p-3 space-y-3 text-sm">
			<div className="flex items-center justify-between">
				<span className="font-medium text-kumo-default truncate">{contactEmail}</span>
				<span className="text-xs text-kumo-muted shrink-0 ml-2">Contact intel</span>
			</div>

			{/* Relationship score */}
			<div>
				<div className="flex justify-between text-xs text-kumo-muted mb-1">
					<span>Relationship strength</span>
				</div>
				<RelationshipGauge score={intelligence.relationshipScore} />
			</div>

			{/* Stats */}
			<div className="divide-y divide-kumo-line/50">
				<StatRow label="Total emails" value={intelligence.totalEmails} />
				<StatRow label="Sent / Received" value={`${intelligence.emailsSent} / ${intelligence.emailsReceived}`} />
				<StatRow label="Avg response time" value={formatResponseTime(intelligence.avgResponseTimeHours)} />
				<StatRow label="Last contact" value={lastContactDate} />
			</div>

			{/* Topics */}
			{intelligence.topTopics.length > 0 && (
				<div>
					<p className="text-xs text-kumo-muted mb-1.5">Top topics</p>
					<div className="flex flex-wrap gap-1">
						{intelligence.topTopics.map((topic) => (
							<span
								key={topic}
								className="inline-block px-2 py-0.5 text-xs rounded-full bg-kumo-accent/10 text-kumo-accent border border-kumo-accent/20"
							>
								{topic}
							</span>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
