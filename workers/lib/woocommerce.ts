// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import type { WooCommerceOrder, WooCommerceLineItem, WooCommerceTracking } from "../../app/types";

export interface WooCommerceConfig {
	storeUrl: string;
	consumerKey: string;
	consumerSecret: string;
}

function authHeader(config: WooCommerceConfig): string {
	return `Basic ${btoa(`${config.consumerKey}:${config.consumerSecret}`)}`;
}

function parseLineItems(raw: unknown[]): WooCommerceLineItem[] {
	return raw.map((item: any) => ({
		name: String(item.name ?? ""),
		quantity: Number(item.quantity ?? 0),
		total: String(item.total ?? "0"),
	}));
}

function parseTracking(metaData: unknown[]): WooCommerceTracking[] {
	if (!Array.isArray(metaData)) return [];
	const trackingMeta = metaData.find((m: any) => m.key === "_wc_shipment_tracking_items");
	if (!trackingMeta || !Array.isArray((trackingMeta as any).value)) return [];
	return (trackingMeta as any).value.map((t: any) => ({
		trackingNumber: String(t.tracking_number ?? ""),
		trackingProvider: String(t.tracking_provider ?? ""),
		customTrackingProvider: t.custom_tracking_provider ? String(t.custom_tracking_provider) : undefined,
		customTrackingLink: t.custom_tracking_link ? String(t.custom_tracking_link) : undefined,
		dateShipped: t.date_shipped ? String(t.date_shipped) : undefined,
	}));
}

function parseOrder(raw: any): WooCommerceOrder {
	const shippingLines: any[] = Array.isArray(raw.shipping_lines) ? raw.shipping_lines : [];
	return {
		id: Number(raw.id),
		number: String(raw.number ?? raw.id),
		status: String(raw.status ?? ""),
		total: String(raw.total ?? "0"),
		currency: String(raw.currency ?? ""),
		dateCreated: String(raw.date_created ?? ""),
		paymentMethodTitle: String(raw.payment_method_title ?? ""),
		shippingMethod: shippingLines[0]?.method_title ? String(shippingLines[0].method_title) : undefined,
		lineItems: parseLineItems(Array.isArray(raw.line_items) ? raw.line_items : []),
		tracking: parseTracking(Array.isArray(raw.meta_data) ? raw.meta_data : []),
	};
}

export async function fetchCustomerOrders(
	config: WooCommerceConfig,
	email: string,
	limit = 20,
): Promise<WooCommerceOrder[]> {
	const base = config.storeUrl.replace(/\/$/, "");
	const auth = authHeader(config);
	const headers = { Authorization: auth, "Content-Type": "application/json" };

	// Step 1: resolve registered customer ID by email (most reliable filter)
	const customerId = await resolveCustomerId(base, headers, email);

	// Step 2: fetch orders filtered server-side
	let orders: unknown[] = [];
	if (customerId !== null) {
		// Filter by customer ID — guaranteed accurate
		const url = `${base}/wp-json/wc/v3/orders?customer=${customerId}&per_page=${limit}&orderby=date&order=desc`;
		const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
		if (!res.ok) {
			const body = await res.json().catch(() => ({})) as any;
			throw new Error(body?.message ?? `WooCommerce API error: ${res.status}`);
		}
		orders = await res.json() as unknown[];
	} else {
		// Guest checkout: use customer_email param and validate billing.email server-side
		const url = `${base}/wp-json/wc/v3/orders?customer_email=${encodeURIComponent(email)}&per_page=${limit}&orderby=date&order=desc`;
		const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
		if (res.ok) {
			const raw = await res.json() as unknown[];
			// Only keep orders whose billing.email matches — guards against APIs that ignore the filter
			orders = (raw as any[]).filter(o => (o.billing?.email ?? "").toLowerCase() === email.toLowerCase());
		}
	}

	return (orders as any[]).map(parseOrder);
}

async function resolveCustomerId(base: string, headers: Record<string, string>, email: string): Promise<number | null> {
	try {
		const url = `${base}/wp-json/wc/v3/customers?email=${encodeURIComponent(email)}&per_page=1`;
		const res = await fetch(url, { headers, signal: AbortSignal.timeout(8_000) });
		if (!res.ok) return null;
		const customers = await res.json() as any[];
		return customers[0]?.id ?? null;
	} catch {
		return null;
	}
}

export async function testWooCommerceConnection(
	config: WooCommerceConfig,
): Promise<{ success: boolean; error?: string }> {
	const base = config.storeUrl.replace(/\/$/, "");
	const url = `${base}/wp-json/wc/v3/system_status`;
	try {
		const res = await fetch(url, {
			headers: { Authorization: authHeader(config), "Content-Type": "application/json" },
			signal: AbortSignal.timeout(10_000),
		});
		if (res.ok) return { success: true };
		const body = await res.json().catch(() => ({})) as any;
		return { success: false, error: body?.message ?? `HTTP ${res.status}` };
	} catch (err: any) {
		return { success: false, error: err?.message ?? "Connection failed" };
	}
}
