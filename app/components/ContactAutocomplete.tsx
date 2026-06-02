import { useEffect, useRef, useState } from "react";
import api from "~/services/api";
import type { Contact } from "~/types";

interface ContactAutocompleteProps {
	label: string;
	value: string;
	onChange: (value: string) => void;
	mailboxId: string;
	placeholder?: string;
}

export function ContactAutocomplete({ label, value, onChange, mailboxId, placeholder }: ContactAutocompleteProps) {
	const [suggestions, setSuggestions] = useState<Contact[]>([]);
	const [showDropdown, setShowDropdown] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			if (!value.trim() || !mailboxId) { setSuggestions([]); return; }
			const parts = value.split(",");
			const currentPart = parts[parts.length - 1].trim();
			if (currentPart.length < 2) { setSuggestions([]); return; }

		api.listContacts(mailboxId, { q: currentPart }).then((contacts) => {
				setSuggestions(Array.isArray(contacts) ? contacts.slice(0, 8) : []);
				setShowDropdown(true);
			}).catch(() => setSuggestions([]));
		}, 300);
		return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
	}, [value, mailboxId]);

	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setShowDropdown(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, []);

	const selectContact = (contact: Contact) => {
		const parts = value.split(",");
		parts[parts.length - 1] = contact.name
			? ` ${contact.name} <${contact.email}>`
			: ` ${contact.email}`;
		const next = parts.join(",").replace(/^,\s*/, "");
		onChange(next + ", ");
		setSuggestions([]);
		setShowDropdown(false);
	};

	return (
		<div ref={ref} className="relative">
			<label className="block text-xs font-medium text-kumo-subtle mb-1">{label}</label>
			<input
				type="text"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
				onKeyDown={(e) => { if (e.key === "Escape") setShowDropdown(false); }}
				placeholder={placeholder}
				className="w-full text-sm border border-kumo-line rounded px-2 py-1.5 bg-kumo-base text-kumo-default focus:outline-none focus:border-kumo-accent"
			/>
			{showDropdown && suggestions.length > 0 && (
				<div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-kumo-line bg-kumo-elevated shadow-lg max-h-48 overflow-y-auto">
					{suggestions.map((c) => (
						<button
							key={c.id}
							type="button"
							className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-kumo-overlay transition-colors"
							onMouseDown={(e) => { e.preventDefault(); selectContact(c); }}
						>
							<span className="flex-1 truncate">
								{c.name ? <><span className="font-medium">{c.name}</span> <span className="text-kumo-subtle">{c.email}</span></> : c.email}
							</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}
