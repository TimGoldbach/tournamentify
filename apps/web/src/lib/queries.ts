"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateSavedThemeInput,
  CreateTournamentInput,
  ScoreInput,
  TournamentDetailDto,
  UpdateDesignInput,
} from "@tournamentify/shared";
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

/** The detail query key, including the optional capability token. Shared by
 * useTournament, useScoreMatch and the SSE hook so they never drift apart. */
export const detailKey = (id: string, token?: string) =>
  token ? [...tournamentKeys.detail(id), token] : tournamentKeys.detail(id);

export function useTournaments() {
  return useQuery({
    queryKey: tournamentKeys.list(),
    queryFn: () => api.listTournaments(),
  });
}

export function useTournament(id: string, token?: string) {
  return useQuery({
    queryKey: detailKey(id, token),
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

export function useScoreMatch(id: string, token?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { matchId: string; input: ScoreInput }) =>
      api.scoreMatch(id, vars.matchId, vars.input, token),
    onSuccess: (detail: TournamentDetailDto) => {
      queryClient.setQueryData(detailKey(id, token), detail);
    },
  });
}

export function useUpdateDesign(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (design: UpdateDesignInput) => api.updateDesign(id, design),
    onSuccess: (detail: TournamentDetailDto) => {
      queryClient.setQueryData(tournamentKeys.detail(id), detail);
    },
  });
}

export const linkKeys = {
  // Outside the detail subtree so SSE-driven detail invalidations don't cascade
  // into an unnecessary links refetch.
  list: (id: string) => ["tournament-links", id] as const,
};

export function useCapabilityLinks(id: string, enabled = true) {
  return useQuery({
    queryKey: linkKeys.list(id),
    queryFn: () => api.listCapabilityLinks(id),
    enabled: Boolean(id) && enabled,
    retry: false, // auth-gated; don't retry a 401/403
  });
}

export function useCreateCapabilityLink(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { type: "VIEW" | "SCORE"; expiresInHours?: number }) =>
      api.createCapabilityLink(id, vars.type, vars.expiresInHours),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: linkKeys.list(id) });
    },
  });
}

export function useRevokeCapabilityLink(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) => api.revokeCapabilityLink(id, linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: linkKeys.list(id) });
    },
  });
}

export function useReseed(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (participantIds: string[]) => api.reseed(id, participantIds),
    onSuccess: (detail: TournamentDetailDto) => {
      queryClient.setQueryData(tournamentKeys.detail(id), detail);
    },
  });
}

export const themeKeys = {
  list: () => ["saved-themes"] as const,
};

export function useSavedThemes(enabled = true) {
  return useQuery({
    queryKey: themeKeys.list(),
    queryFn: () => api.listSavedThemes(),
    enabled,
    retry: false, // auth-gated; don't retry a 401/403
  });
}

export function useCreateSavedTheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSavedThemeInput) => api.createSavedTheme(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: themeKeys.list() });
    },
  });
}

export function useDeleteSavedTheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (themeId: string) => api.deleteSavedTheme(themeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: themeKeys.list() });
    },
  });
}
