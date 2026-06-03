// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useQuery } from "@tanstack/react-query";
import api from "~/services/api";
import type { WooCommerceOrder } from "~/types";
import { queryKeys } from "./keys";

export function useWooCommerceOrders(mailboxId?: string, contactEmail?: string) {
	return useQuery<{ orders: WooCommerceOrder[] }>({
		queryKey: mailboxId && contactEmail
			? queryKeys.woocommerceOrders.list(mailboxId, contactEmail)
			: ["woocommerce-orders", "_disabled"],
		queryFn: () => api.getWooOrders(mailboxId!, contactEmail!),
		enabled: !!mailboxId && !!contactEmail,
		staleTime: 15 * 60 * 1000,
	});
}
