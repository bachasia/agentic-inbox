// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Input, useKumoToastManager } from "@cloudflare/kumo";
import { StorefrontIcon } from "@phosphor-icons/react";
import { useState, useEffect } from "react";
import api from "~/services/api";
import type { WooCommerceSettings } from "~/types";

interface WooCommerceSettingsSectionProps {
	mailboxId?: string;
	initialSettings?: WooCommerceSettings;
	onChange: (settings: WooCommerceSettings) => void;
}

export default function WooCommerceSettingsSection({
	mailboxId,
	initialSettings,
	onChange,
}: WooCommerceSettingsSectionProps) {
	const toastManager = useKumoToastManager();
	const [enabled, setEnabled] = useState(initialSettings?.enabled ?? false);
	const [storeUrl, setStoreUrl] = useState(initialSettings?.storeUrl ?? "");
	const [consumerKey, setConsumerKey] = useState(initialSettings?.consumerKey ?? "");
	const [consumerSecret, setConsumerSecret] = useState(initialSettings?.consumerSecret ?? "");
	const [testing, setTesting] = useState(false);
	const [connectionStatus, setConnectionStatus] = useState<"connected" | "failed" | null>(null);

	// Auto-test on mount if credentials are already configured
	useEffect(() => {
		if (!mailboxId || !initialSettings?.enabled) return;
		const { storeUrl: url, consumerKey: key, consumerSecret: secret } = initialSettings;
		if (!url || !key || !secret) return;
		api.testWooCommerce(mailboxId, { storeUrl: url, consumerKey: key, consumerSecret: secret })
			.then((result) => setConnectionStatus(result.success ? "connected" : "failed"))
			.catch(() => setConnectionStatus("failed"));
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	function notify(field: "enabled" | "storeUrl" | "consumerKey" | "consumerSecret", value: boolean | string) {
		const next: WooCommerceSettings = {
			enabled: field === "enabled" ? value as boolean : enabled,
			storeUrl: field === "storeUrl" ? value as string : storeUrl,
			consumerKey: field === "consumerKey" ? value as string : consumerKey,
			consumerSecret: field === "consumerSecret" ? value as string : consumerSecret,
		};
		onChange(next);
		return next;
	}

	const handleTestConnection = async () => {
		if (!mailboxId) return;
		setTesting(true);
		try {
			const result = await api.testWooCommerce(mailboxId, { storeUrl, consumerKey, consumerSecret });
			if (result.success) {
				setConnectionStatus("connected");
				toastManager.add({ title: "WooCommerce connection successful!" });
			} else {
				setConnectionStatus("failed");
				toastManager.add({ title: `WooCommerce test failed: ${result.error}`, variant: "error" });
			}
		} catch {
			setConnectionStatus("failed");
			toastManager.add({ title: "WooCommerce test request failed", variant: "error" });
		} finally {
			setTesting(false);
		}
	};

	return (
		<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
			<div className="flex items-center justify-between mb-3">
				<div className="flex items-center gap-2">
					<StorefrontIcon size={16} weight="duotone" className="text-kumo-subtle" />
					<span className="text-sm font-medium text-kumo-default">WooCommerce</span>
					{connectionStatus === "connected" && (
						<span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-kumo-success text-white">
							<span className="w-1.5 h-1.5 rounded-full bg-white/60" />
							Connected
						</span>
					)}
					{connectionStatus === "failed" && (
						<span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-kumo-danger text-white">
							<span className="w-1.5 h-1.5 rounded-full bg-white/60" />
							Failed
						</span>
					)}
					{testing && !connectionStatus && (
						<span className="text-xs text-kumo-subtle">Testing…</span>
					)}
				</div>
				<label className="flex items-center gap-2 cursor-pointer">
					<input
						type="checkbox"
						checked={enabled}
						onChange={(e) => { setEnabled(e.target.checked); notify("enabled", e.target.checked); }}
						className="w-4 h-4 accent-blue-500"
					/>
					<span className="text-xs text-kumo-subtle">Enabled</span>
				</label>
			</div>
			<p className="text-xs text-kumo-subtle mb-4">
				Connect your WooCommerce store to see customer orders while handling emails.
			</p>
			<div className="space-y-2">
				<Input
					label="Store URL"
					value={storeUrl}
					onChange={(e) => { setStoreUrl(e.target.value); notify("storeUrl", e.target.value); }}
					placeholder="https://shop.example.com"
				/>
				<Input
					label="Consumer Key"
					type="password"
					value={consumerKey}
					onChange={(e) => { setConsumerKey(e.target.value); notify("consumerKey", e.target.value); }}
					placeholder="ck_..."
				/>
				<Input
					label="Consumer Secret"
					type="password"
					value={consumerSecret}
					onChange={(e) => { setConsumerSecret(e.target.value); notify("consumerSecret", e.target.value); }}
					placeholder="cs_..."
				/>
			</div>
			<div className="mt-3">
				<Button
					variant="secondary"
					size="sm"
					onClick={handleTestConnection}
					loading={testing}
					disabled={!storeUrl || !consumerKey || !consumerSecret}
				>
					Test Connection
				</Button>
			</div>
		</div>
	);
}
