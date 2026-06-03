import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import { queryKeys } from "./keys";
import type { GlobalSettings } from "~/types";

export function useGlobalSettings() {
	return useQuery<GlobalSettings>({
		queryKey: queryKeys.globalSettings,
		queryFn: () => api.getGlobalSettings(),
	});
}

export function useUpdateGlobalSettings() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (settings: GlobalSettings) => api.updateGlobalSettings(settings),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.globalSettings }),
	});
}
