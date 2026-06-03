import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchCustomerOrders, testWooCommerceConnection } from "../../workers/lib/woocommerce";

const CONFIG = {
	storeUrl: "https://shop.example.com",
	consumerKey: "ck_test",
	consumerSecret: "cs_test",
};

function mockFetch(body: unknown, status = 200) {
	return vi.fn().mockResolvedValue({
		ok: status >= 200 && status < 300,
		status,
		json: () => Promise.resolve(body),
	} as Response);
}

const SAMPLE_ORDER = {
	id: 42,
	number: "42",
	status: "completed",
	total: "149.00",
	currency: "USD",
	date_created: "2026-06-01T10:00:00",
	payment_method_title: "Stripe",
	shipping_lines: [{ method_title: "Express" }],
	line_items: [
		{ name: "Widget Pro", quantity: 2, total: "99.00" },
		{ name: "Cable Kit", quantity: 1, total: "50.00" },
	],
	meta_data: [
		{
			key: "_wc_shipment_tracking_items",
			value: [
				{
					tracking_number: "ABCD1234",
					tracking_provider: "GHN",
					custom_tracking_link: "https://tracking.example.com/ABCD1234",
				},
			],
		},
	],
};

beforeEach(() => {
	vi.restoreAllMocks();
});

describe("fetchCustomerOrders — response parsing", () => {
	it("parses a standard order response into WooCommerceOrder shape", async () => {
		vi.stubGlobal("fetch", mockFetch([SAMPLE_ORDER]));

		const orders = await fetchCustomerOrders(CONFIG, "test@example.com");

		expect(orders).toHaveLength(1);
		const order = orders[0];
		expect(order.id).toBe(42);
		expect(order.number).toBe("42");
		expect(order.status).toBe("completed");
		expect(order.total).toBe("149.00");
		expect(order.currency).toBe("USD");
		expect(order.paymentMethodTitle).toBe("Stripe");
		expect(order.shippingMethod).toBe("Express");
	});

	it("parses line items correctly", async () => {
		vi.stubGlobal("fetch", mockFetch([SAMPLE_ORDER]));
		const [order] = await fetchCustomerOrders(CONFIG, "test@example.com");
		expect(order.lineItems).toHaveLength(2);
		expect(order.lineItems[0]).toEqual({ name: "Widget Pro", quantity: 2, total: "99.00" });
		expect(order.lineItems[1]).toEqual({ name: "Cable Kit", quantity: 1, total: "50.00" });
	});

	it("extracts _wc_shipment_tracking_items from meta_data", async () => {
		vi.stubGlobal("fetch", mockFetch([SAMPLE_ORDER]));
		const [order] = await fetchCustomerOrders(CONFIG, "test@example.com");
		expect(order.tracking).toHaveLength(1);
		expect(order.tracking[0].trackingNumber).toBe("ABCD1234");
		expect(order.tracking[0].trackingProvider).toBe("GHN");
		expect(order.tracking[0].customTrackingLink).toBe("https://tracking.example.com/ABCD1234");
	});

	it("returns empty tracking array when meta_data has no tracking items", async () => {
		const orderNoTracking = { ...SAMPLE_ORDER, meta_data: [] };
		vi.stubGlobal("fetch", mockFetch([orderNoTracking]));
		const [order] = await fetchCustomerOrders(CONFIG, "test@example.com");
		expect(order.tracking).toEqual([]);
	});

	it("returns empty array for empty orders response", async () => {
		vi.stubGlobal("fetch", mockFetch([]));
		const orders = await fetchCustomerOrders(CONFIG, "nobody@example.com");
		expect(orders).toEqual([]);
	});

	it("throws when WooCommerce returns an error response", async () => {
		vi.stubGlobal("fetch", mockFetch({ message: "Invalid credentials" }, 401));
		await expect(fetchCustomerOrders(CONFIG, "test@example.com")).rejects.toThrow("Invalid credentials");
	});
});

describe("testWooCommerceConnection", () => {
	it("returns success: true when credentials are valid", async () => {
		vi.stubGlobal("fetch", mockFetch({ version: "7.0" }, 200));
		const result = await testWooCommerceConnection(CONFIG);
		expect(result).toEqual({ success: true });
	});

	it("returns success: false with error message on 401", async () => {
		vi.stubGlobal("fetch", mockFetch({ message: "Consumer key is invalid" }, 401));
		const result = await testWooCommerceConnection(CONFIG);
		expect(result.success).toBe(false);
		expect(result.error).toBe("Consumer key is invalid");
	});

	it("returns success: false on network error", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
		const result = await testWooCommerceConnection(CONFIG);
		expect(result.success).toBe(false);
		expect(result.error).toBe("Network error");
	});
});
