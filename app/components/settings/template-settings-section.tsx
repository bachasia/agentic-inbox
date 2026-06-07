import { Button, Input } from "@cloudflare/kumo";
import { PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import RichTextEditor from "~/components/RichTextEditor";
import { useTemplates, useCreateTemplate, useUpdateTemplate, useDeleteTemplate } from "~/queries/templates";

interface Props {
	mailboxId: string;
}

export default function TemplateSettingsSection({ mailboxId }: Props) {
	const { data: templates = [] } = useTemplates(mailboxId);
	const createTemplateMut = useCreateTemplate(mailboxId);
	const updateTemplateMut = useUpdateTemplate(mailboxId);
	const deleteTemplateMut = useDeleteTemplate(mailboxId);

	const [showForm, setShowForm] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [subject, setSubject] = useState("");
	const [body, setBody] = useState("");

	const openNew = () => { setEditingId(null); setName(""); setSubject(""); setBody(""); setShowForm(true); };
	const openEdit = (tpl: { id: string; name: string; subject: string; body: string }) => {
		setEditingId(tpl.id); setName(tpl.name); setSubject(tpl.subject); setBody(tpl.body); setShowForm(true);
	};
	const cancel = () => { setShowForm(false); setEditingId(null); };
	const save = () => {
		if (!name.trim()) return;
		if (editingId) {
			updateTemplateMut.mutate({ id: editingId, name: name.trim(), subject, body }, { onSuccess: cancel });
		} else {
			createTemplateMut.mutate({ name: name.trim(), subject, body }, { onSuccess: cancel });
		}
	};

	return (
		<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
			<div className="flex items-center justify-between mb-4">
				<span className="text-sm font-medium text-kumo-default">Email Templates</span>
				<Button variant="secondary" size="sm" onClick={showForm ? cancel : openNew}>
					{showForm ? "Cancel" : "New template"}
				</Button>
			</div>
			<div className="space-y-2 mb-4">
				{templates.map((tpl) => (
					<div key={tpl.id} className="flex items-center gap-3 py-1 border-b border-kumo-line">
						<span className="flex-1 text-sm text-kumo-default font-medium">{tpl.name}</span>
						<span className="text-xs text-kumo-subtle truncate max-w-[200px]">{tpl.subject}</span>
						<button type="button" className="text-kumo-subtle hover:text-kumo-accent transition-colors" onClick={() => openEdit(tpl)} aria-label={`Edit template ${tpl.name}`}>
							<PencilSimpleIcon size={14} />
						</button>
						<button type="button" className="text-kumo-subtle hover:text-kumo-danger transition-colors" onClick={() => deleteTemplateMut.mutate(tpl.id)} aria-label={`Delete template ${tpl.name}`}>
							<TrashIcon size={14} />
						</button>
					</div>
				))}
				{templates.length === 0 && <p className="text-sm text-kumo-subtle">No templates yet.</p>}
			</div>
			{showForm && (
				<div className="space-y-3 border border-kumo-line rounded-lg p-4">
					<Input label="Template name" size="sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Quick reply" />
					<Input label="Default subject" size="sm" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Re: your inquiry" />
					<div>
						<label className="text-xs font-medium text-kumo-subtle block mb-1">Body</label>
						<div className="h-40 border border-kumo-line rounded overflow-hidden">
							<RichTextEditor value={body} onChange={setBody} />
						</div>
					</div>
					<Button variant="primary" size="sm" disabled={!name.trim() || createTemplateMut.isPending || updateTemplateMut.isPending} onClick={save}>
						{editingId ? "Update template" : "Save template"}
					</Button>
				</div>
			)}
		</div>
	);
}
