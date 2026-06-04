// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import type { WooCommerceOrder } from "~/types";
import { queryKeys } from "./keys";

export function useWooCommerceOrders(mailboxId?: string, contactEmail?: string) {
	const queryClient = useQueryClient();
	const queryKey = mailboxId && contactEmail
		? queryKeys.woocommerceOrders.list(mailboxId, contactEmail)
		: ["woocommerce-orders", "_disabled"];

	const query = useQuery<{ orders: WooCommerceOrder[] }>({
		queryKey,
		queryFn: () => api.getWooOrders(mailboxId!, contactEmail!),
		enabled: !!mailboxId && !!contactEmail,
		staleTime: 15 * 60 * 1000,
	});

	const refresh = async () => {
		await api.getWooOrders(mailboxId!, contactEmail!, true);
		await queryClient.invalidateQueries({ queryKey });
	};

	return { ...query, refresh };
}
