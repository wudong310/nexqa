import { api } from "@/lib/api";
import type { Settings } from "@nexqa/shared";
import { useQuery } from "@tanstack/react-query";

/**
 * Check whether LLM has been configured in global settings.
 *
 * Returns:
 *  - `isConfigured` — true when settings.llm has at least apiKey + model
 *  - `isLoading` — query in-flight
 *
 * The query is only enabled when `enabled` is true (default),
 * so callers can tie it to Sheet open state to avoid unnecessary fetches.
 */
export function useLlmGuard(enabled = true) {
  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["settings"],
    queryFn: () => api.get("/settings"),
    enabled,
    staleTime: 30_000, // cache 30s — settings rarely change mid-session
  });

  const llm = settings?.llm;
  const isConfigured = Boolean(llm?.apiKey && llm?.model);

  return { isConfigured, isLoading } as const;
}
