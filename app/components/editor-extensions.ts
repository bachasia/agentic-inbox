// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Extension } from '@tiptap/core'

// Adds CSS font-family support via TextStyle marks
export const FontFamily = Extension.create({
	name: 'fontFamily',
	addOptions() {
		return { types: ['textStyle'] }
	},
	addGlobalAttributes() {
		return [{
			types: this.options.types,
			attributes: {
				fontFamily: {
					default: null,
					parseHTML: (element: HTMLElement) =>
						element.style.fontFamily?.replace(/['"]/g, '') || null,
					renderHTML: (attributes: Record<string, unknown>) => {
						if (!attributes.fontFamily) return {}
						return { style: `font-family: ${attributes.fontFamily}` }
					},
				},
			},
		}]
	},
	addCommands() {
		return {
			setFontFamily: (fontFamily: string) => ({ chain }: any) =>
				chain().setMark('textStyle', { fontFamily }).run(),
			unsetFontFamily: () => ({ chain }: any) =>
				chain().setMark('textStyle', { fontFamily: null }).removeEmptyTextStyle().run(),
		}
	},
})

// Adds CSS font-size support via TextStyle marks
export const FontSize = Extension.create({
	name: 'fontSize',
	addOptions() {
		return { types: ['textStyle'] }
	},
	addGlobalAttributes() {
		return [{
			types: this.options.types,
			attributes: {
				fontSize: {
					default: null,
					parseHTML: (element: HTMLElement) => element.style.fontSize || null,
					renderHTML: (attributes: Record<string, unknown>) => {
						if (!attributes.fontSize) return {}
						return { style: `font-size: ${attributes.fontSize}` }
					},
				},
			},
		}]
	},
	addCommands() {
		return {
			setFontSize: (fontSize: string) => ({ chain }: any) =>
				chain().setMark('textStyle', { fontSize }).run(),
			unsetFontSize: () => ({ chain }: any) =>
				chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
		}
	},
})
