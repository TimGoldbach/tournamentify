"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateTournamentInput, TournamentDetailDto } from "@tournamentify/shared";
import * as api from "./api";

/**
 * TanStack Query hooks over the typed BFF client. Query keys are namespaced
 * under `["tournaments", …]` so a single mutation can invalidate the list and
 * the affected detail in one go.
 */

export const tournamentKeys = {
  all: ["tournaments"] as const,
  list: () => [...tournamentKeys.all, "list"] as const,
  detail: (id: string) => [...tournamentKeys.all, "detail", id] as const,
};

export function useTournaments() {
  return useQuery({
    queryKey: tournamentKeys.list(),
    queryFn: () => api.listTournaments(),
  });
}

export function useTournament(id: string, token?: string) {
  return useQuery({
    queryKey: token ? [...tournamentKeys.detail(id), token] : tournamentKeys.detail(id),
    queryFn: () => api.getTournament(id, token),
    enabled: Boolean(id),
  });
}

export function useCreateTournament() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTournamentInput) => api.createTournament(input),
    onSuccess: (created: TournamentDetailDto) => {
      queryClient.invalidateQueries({ queryKey: tournamentKeys.list() });
      queryClient.setQueryData(tournamentKeys.detail(created.id), created);
    },
  });
}

export function useDeleteTournament() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTournament(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: tournamentKeys.list() });
      queryClient.removeQueries({ queryKey: tournamentKeys.detail(id) });
    },
  });
}
