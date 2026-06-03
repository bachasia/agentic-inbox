import { Button, Input, useKumoToastManager } from "@cloudflare/kumo";
import { BellIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useGlobalSettings, useUpdateGlobalSettings } from "~/queries/global-settings-query";
import api from "~/services/api";
import type { GlobalSettings, Mailbox } from "~/types";

interface NotificationsGlobalSectionProps {
	mailboxes: Mailbox[];
}

export default function NotificationsGlobalSection({ mailboxes }: NotificationsGlobalSectionProps) {
	const toastManager = useKumoToastManager();
	const { data: globalSettings, isLoading } = useGlobalSettings();
	const updateGlobalSettingsMut = useUpdateGlobalSettings();

	const [tgBotToken, setTgBotToken] = useState("");
	const [tgChatId, setTgChatId] = useState("");
	const [dcWebhookUrl, setDcWebhookUrl] = useState("");
	const [tgStores, setTgStores] = useState<Record<string, { enabled: boolean; topicId: string }>>({});
	const [dcStores, setDcStores] = useState<Record<string, { enabled: boolean }>>({});
	const [savingNotif, setSavingNotif] = useState(false);
	const [testingTg, setTestingTg] = useState(false);
	const [testingDc, setTestingDc] = useState(false);

	useEffect(() => {
		const tg = globalSettings?.notifications?.telegram;
		const dc = globalSettings?.notifications?.discord;
		setTgBotToken(tg?.botToken ?? "");
		setTgChatId(tg?.chatId ?? "");
		setDcWebhookUrl(dc?.webhookUrl ?? "");
		const tgS: Record<string, { enabled: boolean; topicId: string }> = {};
		const dcS: Record<string, { enabled: boolean }> = {};
		for (const m of mailboxes) {
			tgS[m.id] = { enabled: tg?.stores?.[m.id]?.enabled ?? false, topicId: tg?.stores?.[m.id]?.topicId ?? "" };
			dcS[m.id] = { enabled: dc?.stores?.[m.id]?.enabled ?? false };
		}
		setTgStores(tgS);
		setDcStores(dcS);
	}, [globalSettings, mailboxes]);

	const handleSave = async () => {
		setSavingNotif(true);
		const settings: GlobalSettings = {
			notifications: {
				telegram: {
					botToken: tgBotToken,
					chatId: tgChatId,
					stores: Object.fromEntries(
						Object.entries(tgStores).map(([id, v]) => [id, { enabled: v.enabled, topicId: v.topicId || undefined }]),
					),
				},
				discord: {
					webhookUrl: dcWebhookUrl,
					stores: dcStores,
				},
			},
		};
		try {
			await updateGlobalSettingsMut.mutateAsync(settings);
			toastManager.add({ title: "Notification settings saved!" });
		} catch {
			toastManager.add({ title: "Failed to save notification settings", variant: "error" });
		} finally {
			setSavingNotif(false);
		}
	};

	const handleTestTelegram = async () => {
		setTestingTg(true);
		try {
			const r = await api.testGlobalNotification("telegram", { botToken: tgBotToken, chatId: tgChatId });
			toastManager.add({ title: r.success ? "Telegram test sent!" : `Test failed: ${r.error}`, variant: r.success ? undefined : "error" });
		} catch {
			toastManager.add({ title: "Telegram test request failed", variant: "error" });
		} finally {
			setTestingTg(false);
		}
	};

	const handleTestDiscord = async () => {
		setTestingDc(true);
		try {
			const r = await api.testGlobalNotification("discord", { webhookUrl: dcWebhookUrl });
			toastManager.add({ title: r.success ? "Discord test sent!" : `Test failed: ${r.error}`, variant: r.success ? undefined : "error" });
		} catch {
			toastManager.add({ title: "Discord test request failed", variant: "error" });
		} finally {
			setTestingDc(false);
		}
	};

	return (
		<section className="rounded-xl border border-kumo-line bg-kumo-base overflow-hidden">
			<div className="px-5 py-4 border-b border-kumo-line">
				<h2 className="text-sm font-semibold text-kumo-default">Notifications</h2>
				<p className="text-xs text-kumo-subtle mt-0.5">Configure notification providers and per-store routing.</p>
			</div>
			<div className="px-5 py-4 space-y-4">

				{/* Telegram */}
				<div className="rounded-lg border border-kumo-line p-4 space-y-3">
					<div className="flex items-center gap-2">
						<BellIcon size={14} className="text-kumo-subtle" />
						<span className="text-sm font-medium text-kumo-default">Telegram</span>
					</div>
					<Input
						label="Bot Token"
						type="password"
						value={tgBotToken}
						onChange={(e) => setTgBotToken(e.target.value)}
						placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
					/>
					<div className="flex items-end gap-2">
						<div className="flex-1">
							<Input
								label="Chat ID"
								value={tgChatId}
								onChange={(e) => setTgChatId(e.target.value)}
								placeholder="-100123456789"
							/>
						</div>
						<Button
							variant="secondary"
							size="sm"
							onClick={handleTestTelegram}
							loading={testingTg}
							disabled={!tgBotToken || !tgChatId}
						>
							Send Test
						</Button>
					</div>
					{mailboxes.length > 0 && (
						<div className="space-y-1 pt-1">
							<p className="text-xs text-kumo-subtle font-medium">Per-store routing</p>
							{mailboxes.map((m) => (
								<div key={m.id} className="flex items-center gap-3 py-1.5 border-b border-kumo-line last:border-0">
									<span className="text-xs text-kumo-default flex-1 truncate">{m.email}</span>
									<label className="flex items-center gap-1.5 cursor-pointer shrink-0">
										<input
											type="checkbox"
											className="w-3.5 h-3.5 accent-blue-500"
											checked={tgStores[m.id]?.enabled ?? false}
											onChange={(e) => setTgStores((prev) => ({ ...prev, [m.id]: { ...prev[m.id], enabled: e.target.checked } }))}
										/>
										<span className="text-xs text-kumo-subtle">On</span>
									</label>
									<input
										type="text"
										placeholder="Topic ID"
										value={tgStores[m.id]?.topicId ?? ""}
										onChange={(e) => setTgStores((prev) => ({ ...prev, [m.id]: { ...prev[m.id], topicId: e.target.value } }))}
										className="w-24 rounded border border-kumo-line bg-kumo-recessed px-2 py-1 text-xs text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-ring"
									/>
								</div>
							))}
						</div>
					)}
				</div>

				{/* Discord */}
				<div className="rounded-lg border border-kumo-line p-4 space-y-3">
					<span className="text-sm font-medium text-kumo-default">Discord</span>
					<div className="flex items-end gap-2">
						<div className="flex-1">
							<Input
								label="Webhook URL"
								type="url"
								value={dcWebhookUrl}
								onChange={(e) => setDcWebhookUrl(e.target.value)}
								placeholder="https://discord.com/api/webhooks/..."
							/>
						</div>
						<Button
							variant="secondary"
							size="sm"
							onClick={handleTestDiscord}
							loading={testingDc}
							disabled={!dcWebhookUrl}
						>
							Send Test
						</Button>
					</div>
					{mailboxes.length > 0 && (
						<div className="space-y-1 pt-1">
							<p className="text-xs text-kumo-subtle font-medium">Per-store routing</p>
							{mailboxes.map((m) => (
								<div key={m.id} className="flex items-center gap-3 py-1.5 border-b border-kumo-line last:border-0">
									<span className="text-xs text-kumo-default flex-1 truncate">{m.email}</span>
									<label className="flex items-center gap-1.5 cursor-pointer">
										<input
											type="checkbox"
											className="w-3.5 h-3.5 accent-blue-500"
											checked={dcStores[m.id]?.enabled ?? false}
											onChange={(e) => setDcStores((prev) => ({ ...prev, [m.id]: { enabled: e.target.checked } }))}
										/>
										<span className="text-xs text-kumo-subtle">On</span>
									</label>
								</div>
							))}
						</div>
					)}
				</div>

				<div className="flex justify-end pt-1">
					<Button variant="primary" size="sm" onClick={handleSave} loading={savingNotif} disabled={isLoading || savingNotif}>
						Save Notification Settings
					</Button>
				</div>
			</div>
		</section>
	);
}
