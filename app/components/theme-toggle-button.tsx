import { Button, Tooltip } from "@cloudflare/kumo";
import { SunIcon, MoonIcon, MonitorIcon } from "@phosphor-icons/react";
import { useThemeStore } from "~/hooks/use-theme-store";

const ICONS = {
	light: <SunIcon size={20} />,
	dark: <MoonIcon size={20} />,
	system: <MonitorIcon size={20} />,
} as const;

const LABELS = {
	light: "Light mode",
	dark: "Dark mode",
	system: "System theme",
} as const;

export default function ThemeToggleButton() {
	const { preference, cycleTheme } = useThemeStore();

	return (
		<Tooltip content={LABELS[preference]} side="bottom" asChild>
			<Button
				variant="ghost"
				shape="square"
				icon={ICONS[preference]}
				onClick={cycleTheme}
				aria-label={LABELS[preference]}
			/>
		</Tooltip>
	);
}
