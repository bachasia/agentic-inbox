// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useState } from "react";
import { ArrowsClockwise } from "@phosphor-icons/react";
import type { WooCommerceOrder, WooCommerceTracking } from "~/types";
import { useWooCommerceOrders } from "~/queries/woocommerce-orders-query";

interface WooCommerceOrdersPanelProps {
	mailboxId?: string;
	contactEmail?: string;
}

const STATUS_COLORS: Record<string, string> = {
	completed: "bg-green-100 text-green-700 border-green-200",
	processing: "bg-yellow-100 text-yellow-700 border-yellow-200",
	cancelled: "bg-red-100 text-red-700 border-red-200",
	failed: "bg-red-100 text-red-700 border-red-200",
	refunded: "bg-red-100 text-red-700 border-red-200",
	"on-hold": "bg-orange-100 text-orange-700 border-orange-200",
	pending: "bg-gray-100 text-gray-600 border-gray-200",
};

function statusColor(status: string): string {
	return STATUS_COLORS[status] ?? "bg-kumo-fill text-kumo-default border-kumo-line";
}

function TrackingRow({ tracking }: { tracking: WooCommerceTracking }) {
	const link = tracking.customTrackingLink;
	return (
		<div className="text-xs text-kumo-muted mt-1">
			<span className="font-medium">{tracking.trackingProvider || tracking.customTrackingProvider}</span>
			{tracking.trackingNumber && (
				<>
					{": "}
					{link ? (
						<a href={link} target="_blank" rel="noopener noreferrer" className="text-kumo-accent underline break-all">
							{tracking.trackingNumber}
						</a>
					) : (
						<span>{tracking.trackingNumber}</span>
					)}
				</>
			)}
		</div>
	);
}

function OrderCard({ order }: { order: WooCommerceOrder }) {
	const date = order.dateCreated
		? new Date(order.dateCreated).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
		: null;

	return (
		<div className="rounded border border-kumo-line bg-kumo-base p-2.5 space-y-1.5 text-xs">
			<div className="flex items-center justify-between gap-2">
				<span className="font-medium text-kumo-default">#{order.number}</span>
				<span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-medium ${statusColor(order.status)}`}>
					{order.status}
				</span>
			</div>
			<div className="flex items-center justify-between text-kumo-muted">
				{date && <span>{date}</span>}
				<span className="font-medium text-kumo-default">{order.currency} {order.total}</span>
			</div>
			{order.lineItems.length > 0 && (
				<ul className="space-y-0.5 text-kumo-muted pl-2 border-l border-kumo-line">
					{order.lineItems.map((item, i) => (
						<li key={i}>{item.name} ×{item.quantity}</li>
					))}
				</ul>
			)}
			{(order.paymentMethodTitle || order.shippingMethod) && (
				<div className="text-kumo-muted">
					{order.paymentMethodTitle && <span>Pay: {order.paymentMethodTitle}</span>}
					{order.paymentMethodTitle && order.shippingMethod && <span> · </span>}
					{order.shippingMethod && <span>Ship: {order.shippingMethod}</span>}
				</div>
			)}
			{order.tracking.map((t, i) => (
				<TrackingRow key={i} tracking={t} />
			))}
		</div>
	);
}

const INITIAL_SHOWN = 3;

export default function WooCommerceOrdersPanel({ mailboxId, contactEmail }: WooCommerceOrdersPanelProps) {
	const { data, isLoading, isError, refresh } = useWooCommerceOrders(mailboxId, contactEmail);
	const [isRefreshing, setIsRefreshing] = useState(false);

	const handleRefresh = async () => {
		setIsRefreshing(true);
		try { await refresh(); } finally { setIsRefreshing(false); }
	};
	const [showAll, setShowAll] = useState(false);

	if (isLoading) {
		return (
			<div className="px-5 py-3 border-b border-kumo-line">
				<div className="rounded-lg border border-kumo-line bg-kumo-subtle p-3 text-xs text-kumo-muted">
					Loading orders…
				</div>
			</div>
		);
	}

	if (isError) {
		return (
			<div className="px-5 py-3 border-b border-kumo-line">
				<div className="rounded-lg border border-kumo-line bg-kumo-subtle p-3 text-xs text-red-500">
					Failed to load orders
				</div>
			</div>
		);
	}

	const orders = data?.orders ?? [];
	if (orders.length === 0) return null;

	const visible = showAll ? orders : orders.slice(0, INITIAL_SHOWN);

	return (
		<div className="px-5 py-3 border-b border-kumo-line">
			<div className="rounded-lg border border-kumo-line bg-kumo-subtle p-3 space-y-2">
				<div className="flex items-center justify-between">
					<span className="text-xs font-medium text-kumo-default">Orders ({orders.length})</span>
					<button
						type="button"
						onClick={handleRefresh}
						disabled={isRefreshing}
						className="text-kumo-muted hover:text-kumo-default transition-colors disabled:opacity-50"
						title="Refresh orders"
					>
						<ArrowsClockwise size={13} className={isRefreshing ? "animate-spin" : ""} />
					</button>
				</div>
				<div className="space-y-2">
					{visible.map((order) => (
						<OrderCard key={order.id} order={order} />
					))}
				</div>
				{orders.length > INITIAL_SHOWN && (
					<button
						type="button"
						onClick={() => setShowAll((v) => !v)}
						className="text-xs text-kumo-accent hover:underline"
					>
						{showAll ? "Show less" : `Show all ${orders.length} orders`}
					</button>
				)}
			</div>
		</div>
	);
}
