// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Banner, Button, Input } from "@cloudflare/kumo";
import { CalendarIcon, FloppyDiskIcon, PaperclipIcon, PaperPlaneTiltIcon, XIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { useParams } from "react-router";
import { useComposeForm } from "~/hooks/useComposeForm";
import { ContactAutocomplete } from "~/components/ContactAutocomplete";
import { useTemplates } from "~/queries/templates";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import RichTextEditor from "./RichTextEditor";

export default function ComposePanel() {
	const { mailboxId, folder } = useParams<{
		mailboxId: string;
		folder: string;
	}>();

	const attachInputRef = useRef<HTMLInputElement>(null);

	const {
		to,
		setTo,
		cc,
		setCc,
		bcc,
		setBcc,
		showCcBcc,
		setShowCcBcc,
		subject,
		setSubject,
		body,
		setBody,
		attachments,
		addAttachments,
		removeAttachment,
		error,
		isSavingDraft,
		isSending,
		formTitle,
		handleSaveDraft,
		handleSend,
		closeCompose,
		closePanel,
	} = useComposeForm(mailboxId, folder);

	const { data: templates = [] } = useTemplates(mailboxId);
	const [scheduledAt, setScheduledAt] = useState("");
	const [showScheduled, setShowScheduled] = useState(false);
	const qc = useQueryClient();

	const scheduleMut = useMutation({
		mutationFn: async ({ draftId, sendAt }: { draftId: string; sendAt: string }) => {
			if (!mailboxId) return;
			await api.scheduleEmail(mailboxId, draftId, sendAt);
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["emails", mailboxId] });
			closePanel();
		},
	});

	const applyTemplate = (templateId: string) => {
		const t = templates.find((tmpl) => tmpl.id === templateId);
		if (!t) return;
		if (!subject) setSubject(t.subject);
		setBody(t.body);
	};

	const handleScheduledSend = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!scheduledAt || !mailboxId) return;
		const result = await api.saveDraft(mailboxId, { to, cc, bcc, subject, body });
		const draftId = (result as any).id;
		if (draftId) scheduleMut.mutate({ draftId, sendAt: new Date(scheduledAt).toISOString() });
	};

	return (
		<div className="flex flex-col h-full bg-kumo-base">
			<div className="flex items-center justify-between px-4 py-3 border-b border-kumo-line shrink-0 md:px-6">
				<h2 className="text-base font-semibold text-kumo-default">
					{formTitle}
				</h2>
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						shape="square"
						size="sm"
						icon={<XIcon size={18} />}
						onClick={closeCompose}
						disabled={isSending}
						aria-label="Close compose"
					/>
				</div>
			</div>

			<form
				onSubmit={(e) => handleSend(e, closePanel)}
				className="flex flex-col flex-1 min-h-0 overflow-y-auto"
			>
				<div className="p-4 md:p-6 space-y-4">
					{error && <Banner variant="error" text={error} />}

					{/* Template picker */}
					{mailboxId && templates.length > 0 && (
						<div className="flex items-center gap-2">
							<select
								onChange={(e) => { applyTemplate(e.target.value); e.target.value = ""; }}
								className="text-sm border border-kumo-line rounded px-2 py-1 bg-kumo-base text-kumo-subtle w-full"
							>
								<option value="">Use template...</option>
								{templates.map((t) => (
									<option key={t.id} value={t.id}>{t.name}</option>
								))}
							</select>
						</div>
					)}

					<div className="border border-kumo-line rounded-md divide-y divide-kumo-line">
						{/* To row */}
						<div className="flex items-center gap-2 px-3 py-2">
							<span className="text-sm font-medium text-kumo-subtle shrink-0 w-12">To</span>
							<div className="flex-1 min-w-0">
								{mailboxId ? (
									<ContactAutocomplete
										label=""
										value={to}
										onChange={setTo}
										mailboxId={mailboxId}
										placeholder="recipient@example.com"
									/>
								) : (
									<input
										type="text"
										placeholder="recipient@example.com"
										className="w-full text-sm bg-transparent outline-none text-kumo-default placeholder:text-kumo-muted"
										value={to}
										onChange={(e) => setTo(e.target.value)}
										required
									/>
								)}
							</div>
							{!showCcBcc && (
								<button
									type="button"
									onClick={() => setShowCcBcc(true)}
									className="shrink-0 text-xs text-kumo-link hover:text-kumo-link-hover font-medium"
								>
									CC / BCC
								</button>
							)}
						</div>

						{showCcBcc && (
							<div className="flex items-center gap-2 px-3 py-2">
								<span className="text-sm font-medium text-kumo-subtle shrink-0 w-12">CC</span>
								<div className="flex-1 min-w-0">
									{mailboxId ? (
										<ContactAutocomplete label="" value={cc} onChange={setCc} mailboxId={mailboxId} placeholder="Separate multiple addresses with commas" />
									) : (
										<input type="text" className="w-full text-sm bg-transparent outline-none text-kumo-default placeholder:text-kumo-muted" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Separate multiple addresses with commas" />
									)}
								</div>
							</div>
						)}

						{showCcBcc && (
							<div className="flex items-center gap-2 px-3 py-2">
								<span className="text-sm font-medium text-kumo-subtle shrink-0 w-12">BCC</span>
								<div className="flex-1 min-w-0">
									{mailboxId ? (
										<ContactAutocomplete label="" value={bcc} onChange={setBcc} mailboxId={mailboxId} placeholder="Separate multiple addresses with commas" />
									) : (
										<input type="text" className="w-full text-sm bg-transparent outline-none text-kumo-default placeholder:text-kumo-muted" value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="Separate multiple addresses with commas" />
									)}
								</div>
							</div>
						)}

						{/* Subject row */}
						<div className="flex items-center gap-2 px-3 py-2">
							<span className="text-sm font-medium text-kumo-subtle shrink-0 w-12">Subject</span>
							<input
								type="text"
								placeholder="Email subject"
								className="flex-1 text-sm bg-transparent outline-none text-kumo-default placeholder:text-kumo-muted"
								value={subject}
								onChange={(e) => setSubject(e.target.value)}
								required
							/>
						</div>
					</div>

					<div className="border border-kumo-line rounded-md overflow-hidden bg-kumo-base">
						<RichTextEditor
							value={body}
							onChange={setBody}
							onUploadImage={mailboxId ? (f) => api.uploadComposeImage(mailboxId, f) : undefined}
						/>
					</div>
				</div>

				{/* Attachment chips */}
				{attachments.length > 0 && (
					<div className="px-4 pt-2 pb-1 flex flex-wrap gap-1.5 md:px-6">
						{attachments.map((file, i) => (
							<span
								key={i}
								className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border border-kumo-line bg-kumo-base text-kumo-strong max-w-[180px]"
							>
								<PaperclipIcon size={11} className="shrink-0 text-kumo-subtle" />
								<span className="truncate">{file.name}</span>
								<button
									type="button"
									onClick={() => removeAttachment(i)}
									className="shrink-0 text-kumo-subtle hover:text-red-500 transition-colors ml-0.5"
									aria-label={`Remove ${file.name}`}
								>
									<XIcon size={11} />
								</button>
							</span>
						))}
					</div>
				)}

				{/* Footer actions */}
				<div className="mt-auto px-4 py-3 border-t border-kumo-line bg-kumo-fill/30 shrink-0 md:px-6">
					{showScheduled && (
						<div className="flex items-center gap-2 mb-3">
							<input
								type="datetime-local"
								value={scheduledAt}
								onChange={(e) => setScheduledAt(e.target.value)}
								className="flex-1 text-sm border border-kumo-line rounded px-2 py-1 bg-kumo-base text-kumo-default"
							/>
							<Button
								type="button"
								variant="primary"
								size="sm"
								disabled={!scheduledAt || scheduleMut.isPending}
								loading={scheduleMut.isPending}
								onClick={handleScheduledSend}
								icon={<CalendarIcon size={14} />}
							>
								Schedule
							</Button>
						</div>
					)}
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<Button type="button" variant="ghost" size="sm" onClick={closeCompose} disabled={isSending}>
								Discard
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								icon={<PaperclipIcon size={14} />}
								onClick={() => attachInputRef.current?.click()}
								aria-label="Attach file"
							/>
							<input
								ref={attachInputRef}
								type="file"
								multiple
								className="hidden"
								onChange={(e) => { if (e.target.files) { addAttachments(e.target.files); e.target.value = ""; } }}
							/>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								icon={<CalendarIcon size={14} />}
								onClick={() => setShowScheduled((v) => !v)}
								aria-label="Schedule send"
							/>
						</div>
						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="secondary"
								size="sm"
								loading={isSavingDraft}
								disabled={isSending}
								icon={<FloppyDiskIcon size={14} />}
								onClick={handleSaveDraft}
							>
								{isSavingDraft ? "Saving..." : "Save as Draft"}
							</Button>
							<Button
								type="submit"
								variant="primary"
								size="sm"
								loading={isSending}
								disabled={isSavingDraft || isSending}
								icon={<PaperPlaneTiltIcon size={14} />}
							>
								{isSending ? "Sending..." : "Send"}
							</Button>
						</div>
					</div>
				</div>
			</form>
		</div>
	);
}
