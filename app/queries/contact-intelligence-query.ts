// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useQuery } from "@tanstack/react-query";
import api from "~/services/api";
import type { ContactIntelligence } from "~/types";
import { queryKeys } from "./keys";

export function useContactIntelligence(mailboxId?: string, contactEmail?: string) {
	return useQuery<ContactIntelligence>({
		queryKey: mailboxId && contactEmail
			? queryKeys.contactIntelligence.detail(mailboxId, contactEmail)
			: ["contact-intelligence", "_disabled"],
		queryFn: () => api.getContactIntelligence(mailboxId!, contactEmail!),
		enabled: !!mailboxId && !!contactEmail,
		staleTime: 7 * 24 * 60 * 60 * 1000, // 7 days — matches server-side cache TTL
	});
}
