// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import TiptapImage from '@tiptap/extension-image'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { useCallback, useRef } from 'react'

function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps) {
	const imgRef = useRef<HTMLImageElement>(null)
	const startX = useRef(0)
	const startWidth = useRef(0)

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault()
			e.stopPropagation()

			startX.current = e.clientX
			startWidth.current = imgRef.current?.offsetWidth ?? (node.attrs.width as number) ?? 300

			const handleMouseMove = (ev: MouseEvent) => {
				const delta = ev.clientX - startX.current
				const newWidth = Math.max(50, startWidth.current + delta)
				updateAttributes({ width: newWidth })
			}

			const handleMouseUp = () => {
				document.removeEventListener('mousemove', handleMouseMove)
				document.removeEventListener('mouseup', handleMouseUp)
			}

			document.addEventListener('mousemove', handleMouseMove)
			document.addEventListener('mouseup', handleMouseUp)
		},
		[node.attrs.width, updateAttributes],
	)

	const width = node.attrs.width as number | null
	const src = node.attrs.src as string
	const alt = node.attrs.alt as string | undefined

	return (
		<NodeViewWrapper
			className="relative inline-block max-w-full"
			style={{ width: width ? `${width}px` : 'auto' }}
		>
			<img
				ref={imgRef}
				src={src}
				alt={alt ?? ''}
				draggable={false}
				className={`block max-w-full h-auto select-none ${selected ? 'ring-2 ring-blue-500 ring-offset-1 rounded-sm' : ''}`}
				style={{ width: width ? `${width}px` : 'auto' }}
			/>

			{/* Resize handle — bottom-right corner, only visible when selected */}
			{selected && (
				<div
					onMouseDown={handleMouseDown}
					className="absolute bottom-0 right-0 w-3 h-3 bg-blue-500 rounded-tl cursor-se-resize z-10"
					title="Drag to resize"
				/>
			)}
		</NodeViewWrapper>
	)
}

// Extends TipTap's Image extension with a `width` attribute and a React NodeView
export const ResizableImage = TiptapImage.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			width: {
				default: null,
				parseHTML: (el) => {
					const w = el.getAttribute('width') || el.style.width?.replace('px', '')
					return w ? Number(w) : null
				},
				renderHTML: (attrs) =>
					attrs.width ? { width: String(attrs.width), style: `width: ${attrs.width}px` } : {},
			},
		}
	},

	addNodeView() {
		return ReactNodeViewRenderer(ResizableImageView)
	},
})
