import type {
  CapabilityLinkDto,
  CreateTournamentInput,
  ScoreInput,
  TournamentDetailDto,
  TournamentSetup,
  TournamentSummaryDto,
  UpdateDesignInput,
} from "@tournamentify/shared";

/**
 * Typed BFF client. The browser only ever talks to Next; the BFF proxy
 * (`/api/bff/*`) injects the service token and the resolved actor headers, so
 * the client itself sends no auth — it just calls the public-to-Next paths.
 */

const BFF = "/api/bff";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }

  // 204 No Content (e.g. DELETE) has no body to parse.
  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export function listTournaments(): Promise<TournamentSummaryDto[]> {
  return request<TournamentSummaryDto[]>(`${BFF}/tournaments`);
}

export function getTournament(id: string, token?: string): Promise<TournamentDetailDto> {
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  return request<TournamentDetailDto>(`${BFF}/tournaments/${encodeURIComponent(id)}${query}`);
}

export function createTournament(input: CreateTournamentInput): Promise<TournamentDetailDto> {
  return request<TournamentDetailDto>(`${BFF}/tournaments`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteTournament(id: string): Promise<void> {
  return request<void>(`${BFF}/tournaments/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function exportSetup(id: string): Promise<TournamentSetup> {
  return request<TournamentSetup>(`${BFF}/tournaments/${encodeURIComponent(id)}/export`);
}

export function importSetup(setup: TournamentSetup): Promise<TournamentDetailDto> {
  return request<TournamentDetailDto>(`${BFF}/tournaments/import`, {
    method: "POST",
    body: JSON.stringify(setup),
  });
}

export function scoreMatch(
  tournamentId: string,
  matchId: string,
  input: ScoreInput,
  token?: string,
): Promise<TournamentDetailDto> {
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  return request<TournamentDetailDto>(
    `${BFF}/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(
      matchId,
    )}/score${query}`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function updateDesign(id: string, design: UpdateDesignInput): Promise<TournamentDetailDto> {
  return request<TournamentDetailDto>(`${BFF}/tournaments/${encodeURIComponent(id)}/design`, {
    method: "PATCH",
    body: JSON.stringify(design),
  });
}

export function createCapabilityLink(id: string, type: "VIEW" | "SCORE"): Promise<CapabilityLinkDto> {
  return request<CapabilityLinkDto>(`${BFF}/tournaments/${encodeURIComponent(id)}/links`, {
    method: "POST",
    body: JSON.stringify({ type }),
  });
}

export function listCapabilityLinks(id: string): Promise<CapabilityLinkDto[]> {
  return request<CapabilityLinkDto[]>(`${BFF}/tournaments/${encodeURIComponent(id)}/links`);
}

/** URL for an EventSource (SSE) subscription — used with `new EventSource(...)`, not fetch. */
export function eventsUrl(id: string, token?: string): string {
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${BFF}/tournaments/${encodeURIComponent(id)}/events${query}`;
}

/**
 * Claims guest-owned tournaments for the just-logged-in user. This one is NOT
 * under the BFF proxy — it hits a dedicated Next route that knows the session
 * and the guest token; the client sends no body.
 */
export function claim(): Promise<{ claimed: number }> {
  return request<{ claimed: number }>(`/api/claim`, {
    method: "POST",
  });
}
