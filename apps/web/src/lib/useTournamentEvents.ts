"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as api from "./api";
import { detailKey } from "./queries";

/**
 * Live refresh via SSE. Opens an EventSource against the BFF events route and
 * invalidates the tournament detail query on every message so TanStack Query
 * refetches the up-to-date bracket + standings.
 *
 * EventSource cannot send custom headers, so authorization rides on the BFF
 * session cookie plus the optional `?token` query that `api.eventsUrl` appends.
 * The connection is browser-only — it never opens during SSR — and is torn
 * down on unmount or whenever `enabled` flips to false.
 */
export function useTournamentEvents(
  id: string,
  token: string | undefined,
  enabled: boolean,
): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Guard against SSR and disabled/unidentified subscriptions.
    if (!enabled || !id) return;
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;

    // Match the exact query key used by `useTournament(id, token)`.
    const queryKey = detailKey(id, token);

    const source = new EventSource(api.eventsUrl(id, token));
    const onMessage = () => {
      queryClient.invalidateQueries({ queryKey });
    };
    source.addEventListener("message", onMessage);

    return () => {
      source.removeEventListener("message", onMessage);
      source.close();
    };
  }, [id, token, enabled, queryClient]);
}
