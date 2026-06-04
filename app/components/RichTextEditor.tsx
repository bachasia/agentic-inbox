// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import LinkExtension from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect } from "react";
import api from "~/services/api";
import { FontFamily, FontSize } from "./editor-extensions";
import { ResizableImage } from "./editor-resizable-image";
import { EditorToolbar } from "./editor-toolbar";

interface RichTextEditorProps {
	value: string;
	onChange: (value: string) => void;
	/** When provided, shows an image upload button in the toolbar. */
	onUploadImage?: (file: File) => Promise<{ url: string }>;
	/** @deprecated Use onUploadImage instead. Kept for signature editor compatibility. */
	enableImages?: boolean;
	/** @deprecated Use onUploadImage instead. */
	mailboxId?: string;
}

export default function RichTextEditor({
	value,
	onChange,
	onUploadImage,
	enableImages = false,
	mailboxId,
}: RichTextEditorProps) {
	const editor = useEditor({
		extensions: [
			StarterKit,
			Underline,
			TextAlign.configure({ types: ["heading", "paragraph"] }),
			LinkExtension.configure({ openOnClick: false }),
			ResizableImage,
			TextStyle,
			Color,
			Highlight.configure({ multicolor: true }),
			FontFamily,
			FontSize,
		],
		content: value,
		editorProps: {
			attributes: {
				class:
					"prose prose-sm max-w-none focus:outline-none min-h-[200px] p-3 text-sm [&_blockquote]:border-l-2 [&_blockquote]:border-kumo-line [&_blockquote]:pl-3 [&_blockquote]:text-kumo-subtle [&_blockquote]:bg-kumo-tint [&_blockquote]:py-1 [&_blockquote]:my-2 [&_blockquote]:text-xs [&_blockquote]:rounded-r-sm",
			},
		},
		onUpdate: ({ editor }) => {
			onChange(editor.getHTML());
		},
	});

	useEffect(() => {
		if (editor && !editor.isDestroyed && value !== editor.getHTML()) {
			editor.commands.setContent(value);
			const rafId = requestAnimationFrame(() => {
				if (!editor.isDestroyed) {
					editor.commands.focus('start');
				}
			});
			return () => cancelAnimationFrame(rafId);
		}
	}, [value, editor]);

	const setLink = useCallback(() => {
		if (!editor) return;
		const previousUrl = editor.getAttributes("link").href;
		const url = window.prompt("URL", previousUrl);
		if (url === null) return;
		if (url === "") {
			editor.chain().focus().extendMarkRange("link").unsetLink().run();
			return;
		}
		editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
	}, [editor]);

	// Resolve image upload function: prefer explicit prop, fall back to legacy mailboxId path
	const resolvedUploadImage = onUploadImage
		?? (mailboxId ? (f: File) => api.uploadSignatureImage(mailboxId, f) : undefined);

	if (!editor) return null;

	return (
		<div className="rounded-lg border border-kumo-line overflow-hidden flex flex-col">
			{/* Editor content */}
			<div className="flex-1 overflow-y-auto">
				<EditorContent editor={editor} />
			</div>

			{/* Gmail-style toolbar at bottom */}
			<EditorToolbar
				editor={editor}
				onUploadImage={resolvedUploadImage}
				onSetLink={setLink}
			/>
		</div>
	);
}
