import {
  CapabilityLink,
  Group,
  Match,
  Participant,
  Round,
  Stage,
  Tournament,
} from "@prisma/client";
import {
  designTokensSchema,
  MatchDto,
  MatchSlotDto,
  StageType,
  TournamentDetailDto,
  TournamentSummaryDto,
} from "@tournamentify/shared";
import { toDomainStageType } from "../bracket/stage-type";

/**
 * Pure Prisma-row -> shared-DTO mapping. No DB access, no Nest decorators — so
 * the service can compose these freely and they stay trivially testable.
 */

// ---------------------------------------------------------------------------
// Stored opponent-slot JSON (the shape the service persists on Match.opponentN)
// ---------------------------------------------------------------------------

type StoredSlot =
  | { participantId: string }
  | { bye: true }
  | { source: { type: "winner_of" | "loser_of"; round: number; match: number } }
  | null;

type ParticipantNameLookup = Map<string, string>;

function sourceLabel(source: { type: "winner_of" | "loser_of"; round: number; match: number }): string {
  const prefix = source.type === "loser_of" ? "Verlierer" : "Sieger";
  return `${prefix} R${source.round} M${source.match}`;
}

function resolveSlot(raw: unknown, names: ParticipantNameLookup): MatchSlotDto | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const slot = raw as StoredSlot;
  if (slot === null) {
    return null;
  }
  if ("participantId" in slot) {
    return {
      participantId: slot.participantId,
      label: names.get(slot.participantId) ?? "",
      score: null,
    };
  }
  if ("bye" in slot && slot.bye) {
    return { participantId: null, label: "BYE", score: null };
  }
  if ("source" in slot && slot.source) {
    return { participantId: null, label: sourceLabel(slot.source), score: null };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Prisma include shapes
// ---------------------------------------------------------------------------

type MatchRow = Match;
type RoundRow = Round & { matches: MatchRow[] };
type GroupRow = Group & { rounds: RoundRow[] };
type StageRow = Stage & { groups: GroupRow[] };

export type TournamentSummaryRow = Tournament & {
  participants: Pick<Participant, "id">[];
  stages: Pick<Stage, "type">[];
};

export type TournamentDetailRow = Tournament & {
  participants: Participant[];
  stages: StageRow[];
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

export function toSummary(t: TournamentSummaryRow): TournamentSummaryDto {
  const stageTypes: StageType[] = t.stages.map((s) => toDomainStageType(s.type));
  return {
    id: t.id,
    name: t.name,
    status: t.status,
    participantCount: t.participants.length,
    stageTypes,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export function toDetail(t: TournamentDetailRow): TournamentDetailDto {
  const names: ParticipantNameLookup = new Map(t.participants.map((p) => [p.id, p.name]));
  const parsedDesign = designTokensSchema.safeParse(t.designTokens);

  return {
    id: t.id,
    name: t.name,
    status: t.status,
    design: parsedDesign.success ? parsedDesign.data : null,
    participants: t.participants.map((p) => ({
      id: p.id,
      name: p.name,
      seed: p.seed ?? null,
    })),
    stages: t.stages.map((stage) => ({
      id: stage.id,
      type: toDomainStageType(stage.type),
      number: stage.number,
      name: stageName(stage),
      groups: stage.groups.map((group) => ({
        id: group.id,
        number: group.number,
        rounds: group.rounds.map((round) => ({
          id: round.id,
          number: round.number,
          name: round.nameOverride ?? `Runde ${round.number}`,
          matches: round.matches.map((match) => toMatch(match, names)),
        })),
      })),
    })),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

function toMatch(match: MatchRow, names: ParticipantNameLookup): MatchDto {
  return {
    id: match.id,
    number: match.number,
    status: match.status,
    opponent1: resolveSlot(match.opponent1, names),
    opponent2: resolveSlot(match.opponent2, names),
  };
}

/** Stage has no name column — the display name lives in Stage.settings.name. */
function stageName(stage: Pick<Stage, "settings" | "number">): string {
  const settings = stage.settings;
  if (settings && typeof settings === "object" && !Array.isArray(settings)) {
    const name = (settings as Record<string, unknown>).name;
    if (typeof name === "string" && name.length > 0) {
      return name;
    }
  }
  return "Hauptrunde";
}

export function toCapabilityLink(link: CapabilityLink): {
  id: string;
  type: "VIEW" | "SCORE";
  token: string;
  expiresAt: string | null;
} {
  return {
    id: link.id,
    type: link.type,
    token: link.token,
    expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
  };
}
