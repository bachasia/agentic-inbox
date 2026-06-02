import { useEffect } from "react";
import { useParams, useSearchParams } from "react-router";
import { useEmails, useMoveEmail, useUpdateEmail } from "~/queries/emails";
import { useUIStore } from "./useUIStore";
import type { Email } from "~/types";

export function useKeyboardShortcuts(mailboxId: string | undefined) {
	const {
		selectedEmailId, selectEmail, startCompose,
		openShortcutsModal, closeShortcutsModal, isShortcutsModalOpen,
		closePanel,
	} = useUIStore();

	const { folder } = useParams<{ folder: string }>();
	const [searchParams] = useSearchParams();
	const page = Number(searchParams.get("page") ?? "1");
	const labelId = searchParams.get("label") ?? undefined;

	const { data: listData } = useEmails(
		mailboxId,
		{
			folder: folder ?? "inbox",
			page: String(page),
			...(labelId ? { label_id: labelId } : {}),
		},
	);
	const emails: Email[] = listData?.emails ?? [];

	const moveEmail = useMoveEmail();
	const updateEmail = useUpdateEmail();

	useEffect(() => {
		if (!mailboxId) return;

		const handler = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement;
			if (
				target.closest("input, textarea, select, [contenteditable]") ||
				target.closest(".ProseMirror")
			) return;

			switch (e.key) {
				case "j":
					selectRelative(emails, selectedEmailId, 1, selectEmail);
					break;
				case "k":
					selectRelative(emails, selectedEmailId, -1, selectEmail);
					break;
				case "e":
					if (selectedEmailId && mailboxId) moveEmail.mutate({ mailboxId, id: selectedEmailId, folderId: "archive" });
					break;
				case "#":
					if (selectedEmailId && mailboxId) moveEmail.mutate({ mailboxId, id: selectedEmailId, folderId: "trash" });
					break;
				case "r":
					if (selectedEmailId) startCompose({ mode: "reply" });
					break;
				case "f":
					if (selectedEmailId) startCompose({ mode: "forward" });
					break;
				case "s":
					if (selectedEmailId && mailboxId) {
						const email = emails.find((em) => em.id === selectedEmailId);
						if (email) updateEmail.mutate({ mailboxId, id: selectedEmailId, data: { starred: !email.starred } });
					}
					break;
				case "u":
					if (selectedEmailId && mailboxId) updateEmail.mutate({ mailboxId, id: selectedEmailId, data: { read: false } });
					break;
				case "c":
					e.preventDefault();
					startCompose({ mode: "new" });
					break;
				case "/":
					e.preventDefault();
					document.querySelector<HTMLInputElement>("[data-search-input]")?.focus();
					break;
				case "?":
					isShortcutsModalOpen ? closeShortcutsModal() : openShortcutsModal();
					break;
				case "Escape":
					if (isShortcutsModalOpen) closeShortcutsModal();
					else closePanel();
					break;
			}
		};

		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [mailboxId, selectedEmailId, emails, isShortcutsModalOpen,
		selectEmail, startCompose, closePanel, openShortcutsModal, closeShortcutsModal,
		moveEmail, updateEmail]);
}

function selectRelative(
	emails: Email[],
	currentId: string | null,
	delta: 1 | -1,
	select: (id: string) => void,
) {
	if (!emails.length) return;
	const idx = emails.findIndex((e) => e.id === currentId);
	const next = emails[((idx + delta) + emails.length) % emails.length];
	select(next.id);
}
