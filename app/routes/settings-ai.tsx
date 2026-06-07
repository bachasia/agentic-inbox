import { Badge, Button, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { ArrowCounterClockwiseIcon, GearIcon, RobotIcon, TrashIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import RuleBuilder from "~/components/RuleBuilder";
import KnowledgeBaseSettingsSection from "~/components/settings/knowledge-base-settings-section";
import { useMailbox, useUpdateMailbox } from "~/queries/mailboxes";
import { useRules, useCreateRule, useUpdateRule, useDeleteRule } from "~/queries/rules-query";

const PROMPT_PLACEHOLDER = `You are an email assistant that helps manage this inbox. You read emails, draft replies, and help organize conversations.\n\nWrite like a real person. Short, direct, flowing prose. Plain text only.\n\n(Leave empty to use the full built-in default prompt)`;

export default function SettingsAiRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const toastManager = useKumoToastManager();
	const { data: mailbox } = useMailbox(mailboxId);
	const updateMailboxMutation = useUpdateMailbox();

	const [agentPrompt, setAgentPrompt] = useState("");
	const [unansweredDays, setUnansweredDays] = useState(3);
	const [digestEnabled, setDigestEnabled] = useState(false);
	const [digestTime, setDigestTime] = useState("08:00");
	const [isSaving, setIsSaving] = useState(false);

	const { data: rules = [] } = useRules(mailboxId);
	const createRuleMut = useCreateRule(mailboxId!);
	const updateRuleMut = useUpdateRule(mailboxId!);
	const deleteRuleMut = useDeleteRule(mailboxId!);
	const [showRuleForm, setShowRuleForm] = useState(false);

	useEffect(() => {
		if (mailbox) {
			setAgentPrompt(mailbox.settings?.agentSystemPrompt || "");
			setUnansweredDays(mailbox.settings?.unansweredDays ?? 3);
			setDigestEnabled(mailbox.settings?.digestEnabled ?? false);
			setDigestTime(mailbox.settings?.digestTime ?? "08:00");
		}
	}, [mailbox]);

	const handleSave = async () => {
		if (!mailbox || !mailboxId) return;
		setIsSaving(true);
		const settings = {
			...mailbox.settings,
			agentSystemPrompt: agentPrompt.trim() || undefined,
			unansweredDays,
			digestEnabled,
			digestTime,
		};
		try {
			await updateMailboxMutation.mutateAsync({ mailboxId, settings });
			toastManager.add({ title: "Settings saved!" });
		} catch {
			toastManager.add({ title: "Failed to save settings", variant: "error" });
		} finally {
			setIsSaving(false);
		}
	};

	if (!mailbox) return <div className="flex justify-center py-20"><Loader size="lg" /></div>;

	const isCustomPrompt = agentPrompt.trim().length > 0;

	return (
		<div className="space-y-6">
			{/* AI Agent Prompt */}
			<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center gap-2">
						<RobotIcon size={16} weight="duotone" className="text-kumo-subtle" />
						<span className="text-sm font-medium text-kumo-default">AI Agent Prompt</span>
						{isCustomPrompt ? <Badge variant="primary">Custom</Badge> : <Badge variant="secondary">Default</Badge>}
					</div>
					{isCustomPrompt && (
						<Button variant="ghost" size="xs" icon={<ArrowCounterClockwiseIcon size={14} />} onClick={() => setAgentPrompt("")}>
							Reset to default
						</Button>
					)}
				</div>
				<p className="text-xs text-kumo-subtle mb-3">
					Customize how the AI agent behaves for this mailbox. Leave empty to use the built-in default prompt.
				</p>
				<textarea
					value={agentPrompt}
					onChange={(e) => setAgentPrompt(e.target.value)}
					placeholder={PROMPT_PLACEHOLDER}
					rows={12}
					className="w-full resize-y rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-2 text-xs text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-1 focus:ring-kumo-ring font-mono leading-relaxed"
				/>
				<p className="text-xs text-kumo-subtle mt-2">
					The prompt is sent as the system message to the AI model. It controls the agent's personality, writing style, and behavior rules.
				</p>
			</div>

			{/* Knowledge Base */}
			<KnowledgeBaseSettingsSection mailboxId={mailboxId!} />

			{/* Proactive AI */}
			<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
				<div className="flex items-center gap-2 mb-4">
					<RobotIcon size={16} weight="duotone" className="text-kumo-subtle" />
					<span className="text-sm font-medium text-kumo-default">Proactive AI</span>
				</div>
				<p className="text-xs text-kumo-subtle mb-4">
					Automatic follow-up reminders and a daily digest delivered to your configured notification channels.
				</p>
				<div className="space-y-4">
					<div className="flex items-center gap-3">
						<label className="text-xs text-kumo-default whitespace-nowrap">Remind after</label>
						<input type="number" min={1} max={30} value={unansweredDays}
							onChange={(e) => setUnansweredDays(Math.max(1, parseInt(e.target.value, 10) || 3))}
							className="w-16 rounded border border-kumo-line bg-kumo-recessed px-2 py-1 text-xs text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-ring" />
						<label className="text-xs text-kumo-default">days with no reply</label>
					</div>
					<div className="flex items-center justify-between">
						<div>
							<span className="text-xs font-medium text-kumo-default">Daily digest</span>
							<p className="text-xs text-kumo-subtle mt-0.5">Morning summary of new emails, action items, and pending follow-ups (UTC time).</p>
						</div>
						<label className="flex items-center gap-2 cursor-pointer">
							<input type="checkbox" checked={digestEnabled} onChange={(e) => setDigestEnabled(e.target.checked)} className="w-4 h-4 accent-blue-500" />
							<span className="text-xs text-kumo-subtle">Enabled</span>
						</label>
					</div>
					{digestEnabled && (
						<div className="flex items-center gap-3">
							<label className="text-xs text-kumo-default whitespace-nowrap">Send at (UTC)</label>
							<input type="time" value={digestTime} onChange={(e) => setDigestTime(e.target.value)}
								className="rounded border border-kumo-line bg-kumo-recessed px-2 py-1 text-xs text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-ring" />
						</div>
					)}
				</div>
			</div>

			{/* Automation Rules */}
			<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center gap-2">
						<GearIcon size={16} className="text-kumo-subtle" />
						<span className="text-sm font-medium text-kumo-default">Automation Rules</span>
					</div>
					<Button variant="secondary" size="sm" onClick={() => setShowRuleForm((v) => !v)}>
						{showRuleForm ? "Cancel" : "New rule"}
					</Button>
				</div>
				{showRuleForm && (
					<div className="mb-4">
						<RuleBuilder isSaving={createRuleMut.isPending} onCancel={() => setShowRuleForm(false)}
							onSave={(data) => { if (!mailboxId) return; createRuleMut.mutate(data, { onSuccess: () => setShowRuleForm(false) }); }} />
					</div>
				)}
				<div className="space-y-2">
					{rules.map((rule) => (
						<div key={rule.id} className="flex items-center gap-3 py-2 border-b border-kumo-line last:border-0">
							<button type="button"
								className={`w-4 h-4 rounded border flex-shrink-0 ${rule.enabled ? "bg-kumo-accent border-kumo-accent" : "border-kumo-line bg-kumo-base"}`}
								title={rule.enabled ? "Disable rule" : "Enable rule"}
								onClick={() => mailboxId && updateRuleMut.mutate({ id: rule.id, updates: { enabled: !rule.enabled } })} />
							<div className="flex-1 min-w-0">
								<p className="text-sm text-kumo-default font-medium truncate">{rule.name}</p>
								<p className="text-xs text-kumo-muted truncate">
									{rule.conditions.length} condition{rule.conditions.length !== 1 ? "s" : ""} →{" "}
									{rule.actions.map((a) => a.type).join(", ")}
								</p>
							</div>
							<button type="button" className="text-kumo-subtle hover:text-kumo-danger transition-colors flex-shrink-0"
								onClick={() => mailboxId && deleteRuleMut.mutate(rule.id)} aria-label={`Delete rule ${rule.name}`}>
								<TrashIcon size={14} />
							</button>
						</div>
					))}
					{rules.length === 0 && !showRuleForm && (
						<p className="text-sm text-kumo-subtle">No rules yet. Rules auto-process inbound emails.</p>
					)}
				</div>
			</div>

			{/* Save */}
			<div className="flex justify-end">
				<Button variant="primary" onClick={handleSave} loading={isSaving}>Save Changes</Button>
			</div>
		</div>
	);
}
