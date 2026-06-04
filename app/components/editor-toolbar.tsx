// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { type Editor } from '@tiptap/react'
import { Tooltip } from '@cloudflare/kumo'
import {
	ArrowClockwiseIcon,
	ArrowCounterClockwiseIcon,
	EraserIcon,
	ImageIcon,
	LinkBreakIcon,
	LinkSimpleIcon,
	ListBulletsIcon,
	ListNumbersIcon,
	QuotesIcon,
	TextAlignCenterIcon,
	TextAlignLeftIcon,
	TextAlignRightIcon,
	TextBIcon,
	TextItalicIcon,
	TextStrikethroughIcon,
	TextUnderlineIcon,
} from '@phosphor-icons/react'
import { useCallback, useRef } from 'react'

const FONT_FAMILIES = [
	{ label: 'Sans-serif', value: 'sans-serif' },
	{ label: 'Serif', value: 'serif' },
	{ label: 'Monospace', value: 'monospace' },
]

const FONT_SIZES = [
	{ label: 'Small', value: '0.8rem' },
	{ label: 'Normal', value: '' },
	{ label: 'Large', value: '1.15rem' },
	{ label: 'Huge', value: '1.5rem' },
]

function Sep() {
	return <div className="mx-0.5 h-4 w-px bg-kumo-fill shrink-0" />
}

function ToolBtn({
	active,
	onClick,
	icon,
	label,
	disabled,
}: {
	active?: boolean
	onClick: () => void
	icon: React.ReactNode
	label: string
	disabled?: boolean
}) {
	return (
		<Tooltip content={label} side="top" asChild>
			<button
				type="button"
				onClick={onClick}
				disabled={disabled}
				aria-label={label}
				className={`p-1 rounded transition-colors ${
					active
						? 'bg-kumo-accent/20 text-kumo-accent'
						: 'text-kumo-subtle hover:bg-kumo-fill hover:text-kumo-default'
				} disabled:opacity-40 disabled:cursor-not-allowed`}
			>
				{icon}
			</button>
		</Tooltip>
	)
}

interface EditorToolbarProps {
	editor: Editor
	onUploadImage?: (file: File) => Promise<{ url: string }>
	onSetLink: () => void
}

export function EditorToolbar({ editor, onUploadImage, onSetLink }: EditorToolbarProps) {
	const textColorRef = useRef<HTMLInputElement>(null)
	const highlightColorRef = useRef<HTMLInputElement>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)

	const currentFontFamily = editor.getAttributes('textStyle').fontFamily ?? 'sans-serif'
	const currentFontSize = editor.getAttributes('textStyle').fontSize ?? ''
	const currentTextColor = editor.getAttributes('textStyle').color ?? '#000000'
	const currentHighlightColor = editor.getAttributes('highlight').color ?? '#ffff00'

	const handleImageUpload = useCallback(
		async (file: File) => {
			if (!onUploadImage) return
			try {
				const { url } = await onUploadImage(file)
				editor.chain().focus().setImage({ src: url }).run()
			} catch (e) {
				console.error('Image upload failed:', (e as Error).message)
			}
		},
		[editor, onUploadImage],
	)

	return (
		<div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-kumo-recessed border-t border-kumo-line shrink-0">
			{/* Font family */}
			<select
				value={currentFontFamily}
				onChange={(e) => {
					if (e.target.value === 'sans-serif') {
						;(editor as any).chain().focus().unsetFontFamily().run()
					} else {
						;(editor as any).chain().focus().setFontFamily(e.target.value).run()
					}
				}}
				className="text-xs border border-kumo-line rounded px-1.5 py-0.5 bg-kumo-base text-kumo-default cursor-pointer h-6 max-w-[90px]"
				aria-label="Font family"
			>
				{FONT_FAMILIES.map((f) => (
					<option key={f.value} value={f.value}>
						{f.label}
					</option>
				))}
			</select>

			{/* Font size */}
			<select
				value={currentFontSize}
				onChange={(e) => {
					const val = e.target.value
					if (!val) {
						;(editor as any).chain().focus().unsetFontSize().run()
					} else {
						;(editor as any).chain().focus().setFontSize(val).run()
					}
				}}
				className="text-xs border border-kumo-line rounded px-1.5 py-0.5 bg-kumo-base text-kumo-default cursor-pointer h-6 max-w-[70px]"
				aria-label="Font size"
			>
				{FONT_SIZES.map((s) => (
					<option key={s.value} value={s.value}>
						{s.label}
					</option>
				))}
			</select>

			<Sep />

			{/* Text formatting */}
			<ToolBtn
				active={editor.isActive('bold')}
				onClick={() => editor.chain().focus().toggleBold().run()}
				icon={<TextBIcon size={14} />}
				label="Bold"
			/>
			<ToolBtn
				active={editor.isActive('italic')}
				onClick={() => editor.chain().focus().toggleItalic().run()}
				icon={<TextItalicIcon size={14} />}
				label="Italic"
			/>
			<ToolBtn
				active={editor.isActive('underline')}
				onClick={() => editor.chain().focus().toggleUnderline().run()}
				icon={<TextUnderlineIcon size={14} />}
				label="Underline"
			/>
			<ToolBtn
				active={editor.isActive('strike')}
				onClick={() => editor.chain().focus().toggleStrike().run()}
				icon={<TextStrikethroughIcon size={14} />}
				label="Strikethrough"
			/>

			<Sep />

			{/* Text color */}
			<Tooltip content="Text color" side="top" asChild>
				<button
					type="button"
					onClick={() => textColorRef.current?.click()}
					aria-label="Text color"
					className="relative p-1 rounded text-kumo-subtle hover:bg-kumo-fill hover:text-kumo-default transition-colors"
				>
					<span
						className="text-xs font-bold leading-none select-none"
						style={{ borderBottom: `2px solid ${currentTextColor}` }}
					>
						A
					</span>
					<input
						ref={textColorRef}
						type="color"
						className="absolute opacity-0 w-0 h-0 pointer-events-none"
						value={currentTextColor}
						onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
					/>
				</button>
			</Tooltip>

			{/* Highlight color */}
			<Tooltip content="Highlight color" side="top" asChild>
				<button
					type="button"
					onClick={() => highlightColorRef.current?.click()}
					aria-label="Highlight color"
					className="relative p-1 rounded text-kumo-subtle hover:bg-kumo-fill hover:text-kumo-default transition-colors"
				>
					<span
						className="text-xs font-bold leading-none select-none px-0.5 rounded-sm"
						style={{
							backgroundColor: editor.isActive('highlight')
								? currentHighlightColor
								: 'transparent',
						}}
					>
						A
					</span>
					<input
						ref={highlightColorRef}
						type="color"
						className="absolute opacity-0 w-0 h-0 pointer-events-none"
						value={currentHighlightColor}
						onChange={(e) =>
							editor.chain().focus().toggleHighlight({ color: e.target.value }).run()
						}
					/>
				</button>
			</Tooltip>

			<Sep />

			{/* Lists */}
			<ToolBtn
				active={editor.isActive('bulletList')}
				onClick={() => editor.chain().focus().toggleBulletList().run()}
				icon={<ListBulletsIcon size={14} />}
				label="Bullet list"
			/>
			<ToolBtn
				active={editor.isActive('orderedList')}
				onClick={() => editor.chain().focus().toggleOrderedList().run()}
				icon={<ListNumbersIcon size={14} />}
				label="Numbered list"
			/>

			<Sep />

			{/* Text alignment */}
			<ToolBtn
				active={editor.isActive({ textAlign: 'left' })}
				onClick={() => editor.chain().focus().setTextAlign('left').run()}
				icon={<TextAlignLeftIcon size={14} />}
				label="Align left"
			/>
			<ToolBtn
				active={editor.isActive({ textAlign: 'center' })}
				onClick={() => editor.chain().focus().setTextAlign('center').run()}
				icon={<TextAlignCenterIcon size={14} />}
				label="Align center"
			/>
			<ToolBtn
				active={editor.isActive({ textAlign: 'right' })}
				onClick={() => editor.chain().focus().setTextAlign('right').run()}
				icon={<TextAlignRightIcon size={14} />}
				label="Align right"
			/>

			<Sep />

			{/* Blockquote & Link */}
			<ToolBtn
				active={editor.isActive('blockquote')}
				onClick={() => editor.chain().focus().toggleBlockquote().run()}
				icon={<QuotesIcon size={14} />}
				label="Blockquote"
			/>
			<ToolBtn
				active={editor.isActive('link')}
				onClick={onSetLink}
				icon={<LinkSimpleIcon size={14} />}
				label="Link"
			/>
			{editor.isActive('link') && (
				<ToolBtn
					onClick={() => editor.chain().focus().unsetLink().run()}
					icon={<LinkBreakIcon size={14} />}
					label="Remove link"
				/>
			)}

			{/* Image upload */}
			{onUploadImage && (
				<>
					<ToolBtn
						onClick={() => fileInputRef.current?.click()}
						icon={<ImageIcon size={14} />}
						label="Insert image"
					/>
					<input
						ref={fileInputRef}
						type="file"
						accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp"
						className="hidden"
						onChange={(e) => {
							const file = e.target.files?.[0]
							if (file) handleImageUpload(file)
							e.target.value = ''
						}}
					/>
				</>
			)}

			<Sep />

			{/* Remove formatting */}
			<ToolBtn
				onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
				icon={<EraserIcon size={14} />}
				label="Remove formatting"
			/>

			<Sep />

			{/* Undo / Redo */}
			<ToolBtn
				disabled={!editor.can().undo()}
				onClick={() => editor.chain().focus().undo().run()}
				icon={<ArrowCounterClockwiseIcon size={14} />}
				label="Undo"
			/>
			<ToolBtn
				disabled={!editor.can().redo()}
				onClick={() => editor.chain().focus().redo().run()}
				icon={<ArrowClockwiseIcon size={14} />}
				label="Redo"
			/>
		</div>
	)
}
