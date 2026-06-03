// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useState } from "react";
import { Button, Input } from "@cloudflare/kumo";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import type { RuleCondition, RuleAction } from "~/types";

const CONDITION_FIELDS: RuleCondition["field"][] = ["from", "to", "subject", "body", "category", "priority"];
const CONDITION_OPERATORS: RuleCondition["operator"][] = ["contains", "equals", "starts_with", "ends_with", "greater_than", "less_than"];
const ACTION_TYPES: RuleAction["type"][] = ["label", "move", "archive", "mark_read", "notify", "webhook"];

const FIELD_LABELS: Record<RuleCondition["field"], string> = {
	from: "From", to: "To", subject: "Subject", body: "Body",
	category: "Category", priority: "Priority",
};
const OP_LABELS: Record<RuleCondition["operator"], string> = {
	contains: "contains", equals: "equals", starts_with: "starts with",
	ends_with: "ends with", greater_than: ">", less_than: "<",
};
const ACTION_LABELS: Record<RuleAction["type"], string> = {
	label: "Apply label (ID)", move: "Move to folder", archive: "Archive",
	mark_read: "Mark as read", notify: "Notify (message)", webhook: "POST to URL",
};

interface RuleBuilderProps {
	onSave: (data: { name: string; conditions: RuleCondition[]; actions: RuleAction[] }) => void;
	onCancel: () => void;
	isSaving?: boolean;
}

const emptyCondition = (): RuleCondition => ({ field: "from", operator: "contains", value: "" });
const emptyAction = (): RuleAction => ({ type: "archive" });

export default function RuleBuilder({ onSave, onCancel, isSaving }: RuleBuilderProps) {
	const [name, setName] = useState("");
	const [conditions, setConditions] = useState<RuleCondition[]>([emptyCondition()]);
	const [actions, setActions] = useState<RuleAction[]>([emptyAction()]);

	const updateCondition = (i: number, patch: Partial<RuleCondition>) =>
		setConditions((prev) => prev.map((c, idx) => idx === i ? { ...c, ...patch } : c));
	const updateAction = (i: number, patch: Partial<RuleAction>) =>
		setActions((prev) => prev.map((a, idx) => idx === i ? { ...a, ...patch } as RuleAction : a));

	const actionNeedsParam = (type: RuleAction["type"]) =>
		["label", "move", "notify", "webhook"].includes(type);
	const actionParamLabel = (type: RuleAction["type"]) =>
		type === "label" ? "Label ID" : type === "move" ? "Folder name" :
		type === "notify" ? "Message" : "Webhook URL";

	const canSave = name.trim() &&
		conditions.every((c) => c.value.trim()) &&
		actions.every((a) => !actionNeedsParam(a.type) || a.params?.value?.trim() || a.params?.labelId?.trim() || a.params?.folder?.trim() || a.params?.message?.trim() || a.params?.url?.trim());

	function handleSave() {
		if (!canSave) return;
		onSave({ name: name.trim(), conditions, actions });
	}

	return (
		<div className="space-y-4 border border-kumo-line rounded-lg p-4">
			<Input label="Rule name" size="sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Archive newsletters" />

			{/* Conditions */}
			<div>
				<div className="flex items-center justify-between mb-2">
					<span className="text-xs font-medium text-kumo-subtle">Conditions (ALL must match)</span>
					<button type="button" className="text-xs text-kumo-accent hover:underline flex items-center gap-0.5"
						onClick={() => setConditions((p) => [...p, emptyCondition()])}>
						<PlusIcon size={12} /> Add
					</button>
				</div>
				<div className="space-y-2">
					{conditions.map((cond, i) => (
						<div key={i} className="flex gap-2 items-center">
							<select
								className="text-xs border border-kumo-line rounded px-2 py-1 bg-kumo-base text-kumo-default"
								value={cond.field}
								onChange={(e) => updateCondition(i, { field: e.target.value as RuleCondition["field"] })}
							>
								{CONDITION_FIELDS.map((f) => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
							</select>
							<select
								className="text-xs border border-kumo-line rounded px-2 py-1 bg-kumo-base text-kumo-default"
								value={cond.operator}
								onChange={(e) => updateCondition(i, { operator: e.target.value as RuleCondition["operator"] })}
							>
								{CONDITION_OPERATORS.map((op) => <option key={op} value={op}>{OP_LABELS[op]}</option>)}
							</select>
							<input
								className="flex-1 text-xs border border-kumo-line rounded px-2 py-1 bg-kumo-base text-kumo-default"
								placeholder="value"
								value={cond.value}
								onChange={(e) => updateCondition(i, { value: e.target.value })}
							/>
							{conditions.length > 1 && (
								<button type="button" className="text-kumo-subtle hover:text-kumo-danger"
									onClick={() => setConditions((p) => p.filter((_, idx) => idx !== i))}>
									<TrashIcon size={14} />
								</button>
							)}
						</div>
					))}
				</div>
			</div>

			{/* Actions */}
			<div>
				<div className="flex items-center justify-between mb-2">
					<span className="text-xs font-medium text-kumo-subtle">Actions</span>
					<button type="button" className="text-xs text-kumo-accent hover:underline flex items-center gap-0.5"
						onClick={() => setActions((p) => [...p, emptyAction()])}>
						<PlusIcon size={12} /> Add
					</button>
				</div>
				<div className="space-y-2">
					{actions.map((action, i) => (
						<div key={i} className="flex gap-2 items-center">
							<select
								className="text-xs border border-kumo-line rounded px-2 py-1 bg-kumo-base text-kumo-default"
								value={action.type}
								onChange={(e) => updateAction(i, { type: e.target.value as RuleAction["type"], params: undefined })}
							>
								{ACTION_TYPES.map((t) => <option key={t} value={t}>{ACTION_LABELS[t]}</option>)}
							</select>
							{actionNeedsParam(action.type) && (
								<input
									className="flex-1 text-xs border border-kumo-line rounded px-2 py-1 bg-kumo-base text-kumo-default"
									placeholder={actionParamLabel(action.type)}
									value={
										action.params?.labelId ?? action.params?.folder ??
										action.params?.message ?? action.params?.url ?? ""
									}
									onChange={(e) => {
										const key = action.type === "label" ? "labelId"
											: action.type === "move" ? "folder"
											: action.type === "notify" ? "message" : "url";
										updateAction(i, { params: { [key]: e.target.value } });
									}}
								/>
							)}
							{actions.length > 1 && (
								<button type="button" className="text-kumo-subtle hover:text-kumo-danger"
									onClick={() => setActions((p) => p.filter((_, idx) => idx !== i))}>
									<TrashIcon size={14} />
								</button>
							)}
						</div>
					))}
				</div>
			</div>

			<div className="flex gap-2 justify-end">
				<Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
				<Button variant="primary" size="sm" disabled={!canSave || isSaving} onClick={handleSave} loading={isSaving}>
					Save rule
				</Button>
			</div>
		</div>
	);
}
