// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Input, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { BookOpenIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import api from "~/services/api";
import type { KbArticle, KbArticleInput } from "~/types";

interface Props {
	mailboxId: string;
}

const CATEGORY_LABELS: Record<KbArticle["category"], string> = {
	brand: "Brand",
	product: "Product",
	policy: "Policy",
	faq: "FAQ",
};

const CATEGORY_COLORS: Record<KbArticle["category"], "purple" | "blue" | "orange" | "green"> = {
	brand: "purple",
	product: "blue",
	policy: "orange",
	faq: "green",
};

const EMPTY_FORM: KbArticleInput = { title: "", content: "", category: "faq" };

export default function KnowledgeBaseSettingsSection({ mailboxId }: Props) {
	const toastManager = useKumoToastManager();
	const [articles, setArticles] = useState<KbArticle[]>([]);
	const [loading, setLoading] = useState(true);
	const [isFormOpen, setIsFormOpen] = useState(false);
	const [editingArticle, setEditingArticle] = useState<KbArticle | null>(null);
	const [form, setForm] = useState<KbArticleInput>(EMPTY_FORM);
	const [saving, setSaving] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);

	useEffect(() => {
		api.listKbArticles(mailboxId)
			.then(setArticles)
			.catch(() => toastManager.add({ title: "Failed to load knowledge base articles", type: "error" }))
			.finally(() => setLoading(false));
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [mailboxId]);

	function openCreate() {
		setEditingArticle(null);
		setForm(EMPTY_FORM);
		setIsFormOpen(true);
	}

	function openEdit(article: KbArticle) {
		setEditingArticle(article);
		setForm({ title: article.title, content: article.content, category: article.category });
		setIsFormOpen(true);
	}

	function closeForm() {
		setIsFormOpen(false);
		setEditingArticle(null);
		setForm(EMPTY_FORM);
	}

	async function handleSave() {
		if (!form.title.trim() || !form.content.trim()) {
			toastManager.add({ title: "Title and content are required", type: "error" });
			return;
		}
		setSaving(true);
		try {
			if (editingArticle) {
				const updated = await api.updateKbArticle(mailboxId, editingArticle.id, form);
				setArticles((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
				toastManager.add({ title: "Article updated" });
			} else {
				const { id } = await api.createKbArticle(mailboxId, form);
				const created = await api.getKbArticle(mailboxId, id);
				setArticles((prev) => [...prev, created]);
				toastManager.add({ title: "Article created" });
			}
			closeForm();
		} catch {
			toastManager.add({ title: "Failed to save article", type: "error" });
		} finally {
			setSaving(false);
		}
	}

	async function handleDelete(article: KbArticle) {
		if (!window.confirm(`Delete "${article.title}"? This cannot be undone.`)) return;
		setDeletingId(article.id);
		try {
			await api.deleteKbArticle(mailboxId, article.id);
			setArticles((prev) => prev.filter((a) => a.id !== article.id));
			toastManager.add({ title: "Article deleted" });
		} catch {
			toastManager.add({ title: "Failed to delete article", type: "error" });
		} finally {
			setDeletingId(null);
		}
	}

	return (
		<div style={{ marginBottom: "2rem" }}>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
				<div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
					<BookOpenIcon size={18} />
					<span style={{ fontWeight: 600, fontSize: "1rem" }}>Knowledge Base</span>
				</div>
				<Button size="sm" onClick={openCreate} icon={<PlusIcon />}>Add Article</Button>
			</div>

			{loading ? (
				<Loader size="sm" />
			) : articles.length === 0 && !isFormOpen ? (
				<p style={{ color: "var(--color-text-muted, #888)", fontSize: "0.875rem" }}>
					No articles yet. Add brand voice, product info, policies, or FAQs to help AI craft better replies.
				</p>
			) : (
				<table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
					<thead>
						<tr style={{ borderBottom: "1px solid var(--color-border, #e5e7eb)" }}>
							<th style={{ textAlign: "left", padding: "0.5rem 0.25rem", fontWeight: 500 }}>Title</th>
							<th style={{ textAlign: "left", padding: "0.5rem 0.25rem", fontWeight: 500 }}>Category</th>
							<th style={{ textAlign: "left", padding: "0.5rem 0.25rem", fontWeight: 500 }}>Updated</th>
							<th style={{ width: "80px" }} />
						</tr>
					</thead>
					<tbody>
						{articles.map((a) => (
							<tr key={a.id} style={{ borderBottom: "1px solid var(--color-border, #f3f4f6)" }}>
								<td style={{ padding: "0.5rem 0.25rem" }}>{a.title}</td>
								<td style={{ padding: "0.5rem 0.25rem" }}>
									<Badge color={CATEGORY_COLORS[a.category]}>{CATEGORY_LABELS[a.category]}</Badge>
								</td>
								<td style={{ padding: "0.5rem 0.25rem", color: "var(--color-text-muted, #888)" }}>
									{new Date(a.updatedAt).toLocaleDateString()}
								</td>
								<td style={{ padding: "0.5rem 0.25rem", display: "flex", gap: "0.25rem" }}>
									<Button size="xs" variant="ghost" icon={<PencilSimpleIcon />} onClick={() => openEdit(a)} />
									<Button
										size="xs"
										variant="ghost"
										icon={<TrashIcon />}
										loading={deletingId === a.id}
										onClick={() => handleDelete(a)}
									/>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}

			{isFormOpen && (
				<div style={{ marginTop: "1rem", padding: "1rem", border: "1px solid var(--color-border, #e5e7eb)", borderRadius: "0.5rem" }}>
					<h4 style={{ margin: "0 0 0.75rem", fontWeight: 600 }}>
						{editingArticle ? "Edit Article" : "New Article"}
					</h4>
					<div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
						<Input
							label="Title"
							value={form.title}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, title: e.target.value }))}
							placeholder="e.g. Return Policy"
						/>
						<div>
							<label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", fontWeight: 500 }}>Category</label>
							<select
								value={form.category}
								onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as KbArticle["category"] }))}
								style={{ width: "100%", padding: "0.4rem 0.5rem", borderRadius: "0.375rem", border: "1px solid var(--color-border, #d1d5db)", fontSize: "0.875rem" }}
							>
								<option value="brand">Brand</option>
								<option value="product">Product</option>
								<option value="policy">Policy</option>
								<option value="faq">FAQ</option>
							</select>
						</div>
						<div>
							<label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", fontWeight: 500 }}>Content</label>
							<textarea
								value={form.content}
								onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
								placeholder="Write the article content here..."
								rows={6}
								style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem", border: "1px solid var(--color-border, #d1d5db)", fontSize: "0.875rem", resize: "vertical", boxSizing: "border-box" }}
							/>
						</div>
						<div style={{ display: "flex", gap: "0.5rem" }}>
							<Button variant="primary" size="sm" onClick={handleSave} loading={saving}>Save</Button>
							<Button variant="ghost" size="sm" onClick={closeForm}>Cancel</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
