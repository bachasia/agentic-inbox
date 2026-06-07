import { NavLink, Outlet, useParams } from "react-router";

export default function SettingsLayout() {
	const { mailboxId } = useParams<{ mailboxId: string }>();

	return (
		<div className="w-full h-full overflow-y-auto">
			<div className="max-w-2xl px-4 py-4 md:px-8 md:py-6">
				<h1 className="text-lg font-semibold text-kumo-default mb-4">Settings</h1>

				<div className="flex gap-1 mb-6 border-b border-kumo-line">
					<NavLink
						to={`/mailbox/${mailboxId}/settings/general`}
						className={({ isActive }) =>
							`px-3 py-1.5 text-sm rounded-t transition-colors -mb-px border-b-2 ${
								isActive
									? "border-kumo-accent font-semibold text-kumo-default"
									: "border-transparent text-kumo-strong hover:text-kumo-default"
							}`
						}
					>
						General
					</NavLink>
					<NavLink
						to={`/mailbox/${mailboxId}/settings/ai`}
						className={({ isActive }) =>
							`px-3 py-1.5 text-sm rounded-t transition-colors -mb-px border-b-2 ${
								isActive
									? "border-kumo-accent font-semibold text-kumo-default"
									: "border-transparent text-kumo-strong hover:text-kumo-default"
							}`
						}
					>
						AI Settings
					</NavLink>
				</div>

				<Outlet />
			</div>
		</div>
	);
}
