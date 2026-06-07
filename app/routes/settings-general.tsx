import { Button, Input, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { PencilSimpleIcon, TagIcon, TrashIcon } from "@phosphor-icons/react";
import DOMPurify from "dompurify";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import RichTextEditor from "~/components/RichTextEditor";
import TemplateSettingsSection from "~/components/settings/template-settings-section";
import WooCommerceSettingsSection from "~/components/settings/woocommerce-settings-section";
import { useLabels, useCreateLabel, useDeleteLabel } from "~/queries/labels";
import { useMailbox, useUpdateMailbox } from "~/queries/mailboxes";
import { htmlToPlainText } from "~/lib/utils";
import type { WooCommerceSettings } from "~/types";

export default function SettingsGeneralRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const toastManager = useKumoToastManager();
	const { data: mailbox } = useMailbox(mailboxId);
	const updateMailboxMutation = useUpdateMailbox();

	const [displayName, setDisplayName] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [signatureEnabled, setSignatureEnabled] = useState(false);
	const [signatureHtml, setSignatureHtml] = useState("");
	const [wooSettings, setWooSettings] = useState<WooCommerceSettings>({
		enabled: false, storeUrl: "", consumerKey: "", consumerSecret: "",
	});

	const { data: labels = [] } = useLabels(mailboxId);
	const createLabelMut = useCreateLabel(mailboxId!);
	const deleteLabelMut = useDeleteLabel(mailboxId!);
	const [newLabelName, setNewLabelName] = useState("");
	const [newLabelColor, setNewLabelColor] = useState("#6366f1");

	useEffect(() => {
		if (mailbox) {
			setDisplayName(mailbox.settings?.fromName || mailbox.name || "");
			const sig = mailbox.settings?.signature;
			setSignatureEnabled(sig?.enabled ?? false);
			setSignatureHtml(sig?.html ?? sig?.text ?? "");
			const woo = mailbox.settings?.woocommerce;
			setWooSettings({
				enabled: woo?.enabled ?? false,
				storeUrl: woo?.storeUrl ?? "",
				consumerKey: woo?.consumerKey ?? "",
				consumerSecret: woo?.consumerSecret ?? "",
			});
		}
	}, [mailbox]);

	const handleSave = async () => {
		if (!mailbox || !mailboxId) return;
		setIsSaving(true);
		const settings = {
			...mailbox.settings,
			fromName: displayName,
			signature: {
				enabled: signatureEnabled,
				html: signatureHtml,
				text: signatureHtml ? htmlToPlainText(signatureHtml) : "",
			},
			woocommerce: wooSettings,
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

	return (
		<div className="space-y-6">
			{/* Account */}
			<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
				<div className="text-sm font-medium text-kumo-default mb-4">Account</div>
				<div className="space-y-3">
					<Input label="Display Name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
					<Input label="Email" type="email" value={mailbox.email} disabled />
				</div>
			</div>

			{/* WooCommerce */}
			<WooCommerceSettingsSection mailboxId={mailboxId} initialSettings={mailbox?.settings?.woocommerce} onChange={setWooSettings} />

			{/* Signature */}
			<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center gap-2">
						<PencilSimpleIcon size={16} weight="duotone" className="text-kumo-subtle" />
						<span className="text-sm font-medium text-kumo-default">Signature</span>
					</div>
					<label className="flex items-center gap-2 cursor-pointer">
						<input type="checkbox" checked={signatureEnabled} onChange={(e) => setSignatureEnabled(e.target.checked)} className="w-4 h-4 accent-blue-500" />
						<span className="text-xs text-kumo-subtle">Enabled</span>
					</label>
				</div>
				<p className="text-xs text-kumo-subtle mb-3">Automatically appended to composed emails and replies.</p>
				{signatureEnabled && (
					<>
						<div className="h-48 mb-3">
							<RichTextEditor value={signatureHtml} onChange={setSignatureHtml} enableImages={true} mailboxId={mailboxId} />
						</div>
						{signatureHtml && (
							<div className="rounded-lg border border-kumo-line bg-kumo-recessed p-3">
								<div className="text-xs text-kumo-subtle mb-2">Preview</div>
								{/* eslint-disable-next-line react/no-danger */}
								<div className="text-sm prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(signatureHtml) }} />
							</div>
						)}
					</>
				)}
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
							<button type="button" className="text-kumo-subtle hover:text-kumo-danger transition-colors"
								onClick={() => mailboxId && deleteLabelMut.mutate(label.id)} aria-label={`Delete label ${label.name}`}>
								<TrashIcon size={14} />
							</button>
						</div>
					))}
				</div>
				<div className="flex items-end gap-2">
					<div className="flex-1">
						<Input label="Label name" size="sm" value={newLabelName} onChange={(e) => setNewLabelName(e.target.value)} placeholder="e.g. Work" />
					</div>
					<div className="flex flex-col gap-1">
						<label className="text-xs text-kumo-subtle">Color</label>
						<input type="color" value={newLabelColor} onChange={(e) => setNewLabelColor(e.target.value)} className="w-9 h-9 rounded border border-kumo-line cursor-pointer" />
					</div>
					<Button variant="secondary" size="sm" disabled={!newLabelName.trim() || createLabelMut.isPending}
						onClick={() => {
							if (!newLabelName.trim() || !mailboxId) return;
							createLabelMut.mutate({ name: newLabelName.trim(), color: newLabelColor }, {
								onSuccess: () => { setNewLabelName(""); setNewLabelColor("#6366f1"); },
							});
						}}>
						Add
					</Button>
				</div>
			</div>

			{/* Email Templates */}
			{mailboxId && <TemplateSettingsSection mailboxId={mailboxId} />}

			{/* Save */}
			<div className="flex justify-end">
				<Button variant="primary" onClick={handleSave} loading={isSaving}>Save Changes</Button>
			</div>
		</div>
	);
}
