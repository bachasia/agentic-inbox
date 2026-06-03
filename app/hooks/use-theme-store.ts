import { useEffect } from "react";
import { create } from "zustand";

type ThemePreference = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeState {
	preference: ThemePreference;
	resolved: ResolvedTheme;
	setPreference: (pref: ThemePreference) => void;
	cycleTheme: () => void;
}

const STORAGE_KEY = "theme-preference";
const CYCLE_ORDER: ThemePreference[] = ["light", "dark", "system"];

function resolveTheme(pref: ThemePreference): ResolvedTheme {
	if (pref !== "system") return pref;
	if (typeof window === "undefined") return "light";
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredPreference(): ThemePreference {
	if (typeof window === "undefined") return "system";
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === "light" || stored === "dark" || stored === "system") return stored;
	return "system";
}

export const useThemeStore = create<ThemeState>((set, get) => ({
	preference: readStoredPreference(),
	resolved: resolveTheme(readStoredPreference()),

	setPreference(pref: ThemePreference) {
		localStorage.setItem(STORAGE_KEY, pref);
		const resolved = resolveTheme(pref);
		document.documentElement.setAttribute("data-mode", resolved);
		set({ preference: pref, resolved });
	},

	cycleTheme() {
		const current = get().preference;
		const idx = CYCLE_ORDER.indexOf(current);
		const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
		get().setPreference(next);
	},
}));

export function useThemeSync() {
	const { preference, setPreference } = useThemeStore();

	useEffect(() => {
		if (preference !== "system") return;

		const mql = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = () => setPreference("system");
		mql.addEventListener("change", handler);
		return () => mql.removeEventListener("change", handler);
	}, [preference, setPreference]);
}
