// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Input, Loader, useKumoToastManager } from "@cloudflare/kumo";
import {
	ArrowCounterClockwiseIcon,
	BellIcon,
	PencilSimpleIcon,
	RobotIcon,
	TagIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import DOMPurify from "dompurify";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import RichTextEditor from "~/components/RichTextEditor";
import { useMailbox, useUpdateMailbox } from "~/queries/mailboxes";
import { useLabels, useCreateLabel, useUpdateLabel, useDeleteLabel } from "~/queries/labels";
import { useTemplates, useCreateTemplate, useUpdateTemplate, useDeleteTemplate } from "~/queries/templates";
import { useRules, useCreateRule, useUpdateRule, useDeleteRule } from "~/queries/rules-query";
import RuleBuilder from "~/components/RuleBuilder";
import api from "~/services/api";
import { htmlToPlainText } from "~/lib/utils";
import { GearIcon } from "@phosphor-icons/react";

const PROMPT_PLACEHOLDER = `You are an email assistant that helps manage this inbox. You read emails, draft replies, and help organize conversations.\n\nWrite like a real person. Short, direct, flowing prose. Plain text only.\n\n(Leave empty to use the full built-in default prompt)`;

export default function SettingsRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const toastManager = useKumoToastManager();
	const { data: mailbox } = useMailbox(mailboxId);
	const updateMailboxMutation = useUpdateMailbox();

	const [displayName, setDisplayName] = useState("");
	const [agentPrompt, setAgentPrompt] = useState("");
	const [isSaving, setIsSaving] = useState(false);

	// Notification state
	const [telegramEnabled, setTelegramEnabled] = useState(false);
	const [telegramBotToken, setTelegramBotToken] = useState("");
	const [telegramChatId, setTelegramChatId] = useState("");
	const [telegramTopicId, setTelegramTopicId] = useState("");
	const [discordEnabled, setDiscordEnabled] = useState(false);
	const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
	const [testingTelegram, setTestingTelegram] = useState(false);
	const [testingDiscord, setTestingDiscord] = useState(false);

	// Signature state
	const [signatureEnabled, setSignatureEnabled] = useState(false);
	const [signatureHtml, setSignatureHtml] = useState("");

	// Proactive AI state
	const [unansweredDays, setUnansweredDays] = useState(3);
	const [digestEnabled, setDigestEnabled] = useState(false);
	const [digestTime, setDigestTime] = useState("08:00");

	// Labels state
	const { data: labels = [] } = useLabels(mailboxId);
	const createLabelMut = useCreateLabel(mailboxId!);
	const updateLabelMut = useUpdateLabel(mailboxId!);
	const deleteLabelMut = useDeleteLabel(mailboxId!);
	const [newLabelName, setNewLabelName] = useState("");
	const [newLabelColor, setNewLabelColor] = useState("#6366f1");

	// Templates state
	const { data: templates = [] } = useTemplates(mailboxId);
	const createTemplateMut = useCreateTemplate(mailboxId!);
	const deleteTemplateMut = useDeleteTemplate(mailboxId!);
	const [newTplName, setNewTplName] = useState("");
	const [newTplSubject, setNewTplSubject] = useState("");
	const [newTplBody, setNewTplBody] = useState("");
	const [showTplForm, setShowTplForm] = useState(false);

	// Automation rules state
	const { data: rules = [] } = useRules(mailboxId);
	const createRuleMut = useCreateRule(mailboxId!);
	const updateRuleMut = useUpdateRule(mailboxId!);
	const deleteRuleMut = useDeleteRule(mailboxId!);
	const [showRuleForm, setShowRuleForm] = useState(false);

	useEffect(() => {
		if (mailbox) {
			setDisplayName(mailbox.settings?.fromName || mailbox.name || "");
			setAgentPrompt(mailbox.settings?.agentSystemPrompt || "");

			const n = mailbox.settings?.notifications;
			setTelegramEnabled(n?.telegram?.enabled ?? false);
			setTelegramBotToken(n?.telegram?.botToken ?? "");
			setTelegramChatId(n?.telegram?.chatId ?? "");
			setTelegramTopicId(n?.telegram?.topicId ?? "");
			setDiscordEnabled(n?.discord?.enabled ?? false);
			setDiscordWebhookUrl(n?.discord?.webhookUrl ?? "");

			const sig = mailbox.settings?.signature;
			setSignatureEnabled(sig?.enabled ?? false);
			setSignatureHtml(sig?.html ?? sig?.text ?? "");

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
			fromName: displayName,
			agentSystemPrompt: agentPrompt.trim() || undefined,
			notifications: {
				telegram: { enabled: telegramEnabled, botToken: telegramBotToken, chatId: telegramChatId, topicId: telegramTopicId || undefined },
				discord: { enabled: discordEnabled, webhookUrl: discordWebhookUrl },
			},
			signature: {
				enabled: signatureEnabled,
				html: signatureHtml,
				text: signatureHtml ? htmlToPlainText(signatureHtml) : "",
			},
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

	const handleResetPrompt = () => setAgentPrompt("");

	const handleTestTelegram = async () => {
		if (!mailboxId) return;
		setTestingTelegram(true);
		try {
			const result = await api.testNotification(mailboxId, "telegram", { botToken: telegramBotToken, chatId: telegramChatId, ...(telegramTopicId ? { topicId: telegramTopicId } : {}) });
			if (result.success) {
				toastManager.add({ title: "Telegram test sent successfully!" });
			} else {
				toastManager.add({ title: `Telegram test failed: ${result.error}`, variant: "error" });
			}
		} catch {
			toastManager.add({ title: "Telegram test request failed", variant: "error" });
		} finally {
			setTestingTelegram(false);
		}
	};

	const handleTestDiscord = async () => {
		if (!mailboxId) return;
		setTestingDiscord(true);
		try {
			const result = await api.testNotification(mailboxId, "discord", { webhookUrl: discordWebhookUrl });
			if (result.success) {
				toastManager.add({ title: "Discord test sent successfully!" });
			} else {
				toastManager.add({ title: `Discord test failed: ${result.error}`, variant: "error" });
			}
		} catch {
			toastManager.add({ title: "Discord test request failed", variant: "error" });
		} finally {
			setTestingDiscord(false);
		}
	};

	if (!mailbox) {
		return (
			<div className="flex justify-center py-20">
				<Loader size="lg" />
			</div>
		);
	}

	const isCustomPrompt = agentPrompt.trim().length > 0;

	return (
		<div className="max-w-2xl px-4 py-4 md:px-8 md:py-6 h-full overflow-y-auto">
			<h1 className="text-lg font-semibold text-kumo-default mb-6">Settings</h1>

			<div className="space-y-6">
				{/* Account */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="text-sm font-medium text-kumo-default mb-4">Account</div>
					<div className="space-y-3">
						<Input
							label="Display Name"
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
						/>
						<Input label="Email" type="email" value={mailbox.email} disabled />
					</div>
				</div>

				{/* Notifications */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center gap-2 mb-4">
						<BellIcon size={16} weight="duotone" className="text-kumo-subtle" />
						<span className="text-sm font-medium text-kumo-default">Notifications</span>
					</div>
					<p className="text-xs text-kumo-subtle mb-4">
						Get notified when new emails arrive. Configure one or both providers.
					</p>

					{/* Telegram */}
					<div className="rounded-lg border border-kumo-line p-4 mb-3">
						<div className="flex items-center justify-between mb-3">
							<span className="text-sm font-medium text-kumo-default">Telegram</span>
							<label className="flex items-center gap-2 cursor-pointer">
								<input
									type="checkbox"
									checked={telegramEnabled}
									onChange={(e) => setTelegramEnabled(e.target.checked)}
									className="w-4 h-4 accent-blue-500"
								/>
								<span className="text-xs text-kumo-subtle">Enabled</span>
							</label>
						</div>
						<div className="space-y-2">
							<Input
								label="Bot Token"
								type="password"
								value={telegramBotToken}
								onChange={(e) => setTelegramBotToken(e.target.value)}
								placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
							/>
							<Input
								label="Chat ID"
								value={telegramChatId}
								onChange={(e) => setTelegramChatId(e.target.value)}
								placeholder="-100123456789"
							/>
							<Input
								label="Topic ID (optional)"
								value={telegramTopicId}
								onChange={(e) => setTelegramTopicId(e.target.value)}
								placeholder="123"
							/>
						</div>
						<div className="mt-3">
							<Button
								variant="secondary"
								size="sm"
								onClick={handleTestTelegram}
								loading={testingTelegram}
								disabled={!telegramBotToken || !telegramChatId}
							>
								Send Test
							</Button>
						</div>
					</div>

					{/* Discord */}
					<div className="rounded-lg border border-kumo-line p-4">
						<div className="flex items-center justify-between mb-3">
							<span className="text-sm font-medium text-kumo-default">Discord</span>
							<label className="flex items-center gap-2 cursor-pointer">
								<input
									type="checkbox"
									checked={discordEnabled}
									onChange={(e) => setDiscordEnabled(e.target.checked)}
									className="w-4 h-4 accent-blue-500"
								/>
								<span className="text-xs text-kumo-subtle">Enabled</span>
							</label>
						</div>
						<Input
							label="Webhook URL"
							type="url"
							value={discordWebhookUrl}
							onChange={(e) => setDiscordWebhookUrl(e.target.value)}
							placeholder="https://discord.com/api/webhooks/..."
						/>
						<div className="mt-3">
							<Button
								variant="secondary"
								size="sm"
								onClick={handleTestDiscord}
								loading={testingDiscord}
								disabled={!discordWebhookUrl}
							>
								Send Test
							</Button>
						</div>
					</div>
				</div>

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
							<input
								type="number"
								min={1}
								max={30}
								value={unansweredDays}
								onChange={(e) => setUnansweredDays(Math.max(1, parseInt(e.target.value, 10) || 3))}
								className="w-16 rounded border border-kumo-line bg-kumo-recessed px-2 py-1 text-xs text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-ring"
							/>
							<label className="text-xs text-kumo-default">days with no reply</label>
						</div>
						<div className="flex items-center justify-between">
							<div>
								<span className="text-xs font-medium text-kumo-default">Daily digest</span>
								<p className="text-xs text-kumo-subtle mt-0.5">Morning summary of new emails, action items, and pending follow-ups (UTC time).</p>
							</div>
							<label className="flex items-center gap-2 cursor-pointer">
								<input
									type="checkbox"
									checked={digestEnabled}
									onChange={(e) => setDigestEnabled(e.target.checked)}
									className="w-4 h-4 accent-blue-500"
								/>
								<span className="text-xs text-kumo-subtle">Enabled</span>
							</label>
						</div>
						{digestEnabled && (
							<div className="flex items-center gap-3">
								<label className="text-xs text-kumo-default whitespace-nowrap">Send at (UTC)</label>
								<input
									type="time"
									value={digestTime}
									onChange={(e) => setDigestTime(e.target.value)}
									className="rounded border border-kumo-line bg-kumo-recessed px-2 py-1 text-xs text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-ring"
								/>
							</div>
						)}
					</div>
				</div>

				{/* Signature */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center gap-2">
							<PencilSimpleIcon size={16} weight="duotone" className="text-kumo-subtle" />
							<span className="text-sm font-medium text-kumo-default">Signature</span>
						</div>
						<label className="flex items-center gap-2 cursor-pointer">
							<input
								type="checkbox"
								checked={signatureEnabled}
								onChange={(e) => setSignatureEnabled(e.target.checked)}
								className="w-4 h-4 accent-blue-500"
							/>
							<span className="text-xs text-kumo-subtle">Enabled</span>
						</label>
					</div>
					<p className="text-xs text-kumo-subtle mb-3">
						Automatically appended to composed emails and replies.
					</p>
					{signatureEnabled && (
						<>
							<div className="h-48 mb-3">
								<RichTextEditor
									value={signatureHtml}
									onChange={setSignatureHtml}
									enableImages={true}
									mailboxId={mailboxId}
								/>
							</div>
							{signatureHtml && (
								<div className="rounded-lg border border-kumo-line bg-kumo-recessed p-3">
									<div className="text-xs text-kumo-subtle mb-2">Preview</div>
									<div
										className="text-sm prose prose-sm max-w-none"
										// eslint-disable-next-line react/no-danger
										dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(signatureHtml) }}
									/>
								</div>
							)}
						</>
					)}
				</div>

				{/* Agent System Prompt */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center gap-2">
							<RobotIcon size={16} weight="duotone" className="text-kumo-subtle" />
							<span className="text-sm font-medium text-kumo-default">AI Agent Prompt</span>
							{isCustomPrompt ? (
								<Badge variant="primary">Custom</Badge>
							) : (
								<Badge variant="secondary">Default</Badge>
							)}
						</div>
						{isCustomPrompt && (
							<Button
								variant="ghost"
								size="xs"
								icon={<ArrowCounterClockwiseIcon size={14} />}
								onClick={handleResetPrompt}
							>
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

				{/* Labels */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center gap-2 mb-4">
						<TagIcon size={16} weight="duotone" className="text-kumo-subtle" />
						<span className="text-sm font-medium text-kumo-default">Labels</span>
					</div>
					<div className="space-y-2 mb-4">
						{labels.map((label) => (
							<div key={label.id} className="flex items-center gap-3 py-1">
								<span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: label.color }} />
								<span className="flex-1 text-sm text-kumo-default">{label.name}</span>
								<button
									type="button"
									className="text-kumo-subtle hover:text-kumo-danger transition-colors"
									onClick={() => mailboxId && deleteLabelMut.mutate(label.id)}
									aria-label={`Delete label ${label.name}`}
								>
									<TrashIcon size={14} />
								</button>
							</div>
						))}
					</div>
					<div className="flex items-end gap-2">
						<div className="flex-1">
							<Input
								label="Label name"
								size="sm"
								value={newLabelName}
								onChange={(e) => setNewLabelName(e.target.value)}
								placeholder="e.g. Work"
							/>
						</div>
						<div className="flex flex-col gap-1">
							<label className="text-xs text-kumo-subtle">Color</label>
							<input
								type="color"
								value={newLabelColor}
								onChange={(e) => setNewLabelColor(e.target.value)}
								className="w-9 h-9 rounded border border-kumo-line cursor-pointer"
							/>
						</div>
						<Button
							variant="secondary"
							size="sm"
							disabled={!newLabelName.trim() || createLabelMut.isPending}
							onClick={() => {
								if (!newLabelName.trim() || !mailboxId) return;
								createLabelMut.mutate({ name: newLabelName.trim(), color: newLabelColor }, {
									onSuccess: () => { setNewLabelName(""); setNewLabelColor("#6366f1"); },
								});
							}}
						>
							Add
						</Button>
					</div>
				</div>

				{/* Templates */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center justify-between mb-4">
						<span className="text-sm font-medium text-kumo-default">Email Templates</span>
						<Button variant="secondary" size="sm" onClick={() => setShowTplForm((v) => !v)}>
							{showTplForm ? "Cancel" : "New template"}
						</Button>
					</div>
					<div className="space-y-2 mb-4">
						{templates.map((tpl) => (
							<div key={tpl.id} className="flex items-center gap-3 py-1 border-b border-kumo-line">
								<span className="flex-1 text-sm text-kumo-default font-medium">{tpl.name}</span>
								<span className="text-xs text-kumo-subtle truncate max-w-[200px]">{tpl.subject}</span>
								<button
									type="button"
									className="text-kumo-subtle hover:text-kumo-danger transition-colors"
									onClick={() => mailboxId && deleteTemplateMut.mutate(tpl.id)}
									aria-label={`Delete template ${tpl.name}`}
								>
									<TrashIcon size={14} />
								</button>
							</div>
						))}
						{templates.length === 0 && (
							<p className="text-sm text-kumo-subtle">No templates yet.</p>
						)}
					</div>
					{showTplForm && (
						<div className="space-y-3 border border-kumo-line rounded-lg p-4">
							<Input label="Template name" size="sm" value={newTplName} onChange={(e) => setNewTplName(e.target.value)} placeholder="e.g. Quick reply" />
							<Input label="Default subject" size="sm" value={newTplSubject} onChange={(e) => setNewTplSubject(e.target.value)} placeholder="e.g. Re: your inquiry" />
							<div>
								<label className="text-xs font-medium text-kumo-subtle block mb-1">Body</label>
								<div className="h-40 border border-kumo-line rounded overflow-hidden">
									<RichTextEditor value={newTplBody} onChange={setNewTplBody} />
								</div>
							</div>
							<Button
								variant="primary"
								size="sm"
								disabled={!newTplName.trim() || createTemplateMut.isPending}
								onClick={() => {
									if (!newTplName.trim() || !mailboxId) return;
									createTemplateMut.mutate(
										{ name: newTplName.trim(), subject: newTplSubject, body: newTplBody },
										{ onSuccess: () => { setNewTplName(""); setNewTplSubject(""); setNewTplBody(""); setShowTplForm(false); } },
									);
								}}
							>
								Save template
							</Button>
						</div>
					)}
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
							<RuleBuilder
								isSaving={createRuleMut.isPending}
								onCancel={() => setShowRuleForm(false)}
								onSave={(data) => {
									if (!mailboxId) return;
									createRuleMut.mutate(data, {
										onSuccess: () => setShowRuleForm(false),
									});
								}}
							/>
						</div>
					)}

					<div className="space-y-2">
						{rules.map((rule) => (
							<div key={rule.id} className="flex items-center gap-3 py-2 border-b border-kumo-line last:border-0">
								<button
									type="button"
									className={`w-4 h-4 rounded border flex-shrink-0 ${rule.enabled ? "bg-kumo-accent border-kumo-accent" : "border-kumo-line bg-kumo-base"}`}
									title={rule.enabled ? "Disable rule" : "Enable rule"}
									onClick={() => mailboxId && updateRuleMut.mutate({ id: rule.id, updates: { enabled: !rule.enabled } })}
								/>
								<div className="flex-1 min-w-0">
									<p className="text-sm text-kumo-default font-medium truncate">{rule.name}</p>
									<p className="text-xs text-kumo-muted truncate">
										{rule.conditions.length} condition{rule.conditions.length !== 1 ? "s" : ""} →{" "}
										{rule.actions.map((a) => a.type).join(", ")}
									</p>
								</div>
								<button
									type="button"
									className="text-kumo-subtle hover:text-kumo-danger transition-colors flex-shrink-0"
									onClick={() => mailboxId && deleteRuleMut.mutate(rule.id)}
									aria-label={`Delete rule ${rule.name}`}
								>
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
					<Button variant="primary" onClick={handleSave} loading={isSaving}>
						Save Changes
					</Button>
				</div>
			</div>
		</div>
	);
}
