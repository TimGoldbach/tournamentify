import { z } from "zod";
import { designTokensSchema, stageTypeSchema, tournamentSetupSchema } from "./tournament";

/**
 * API contract — request inputs and response read-models, shared by the Nest
 * backend (validation + typing) and the Next frontend (typed BFF client).
 */

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** Create = a setup without the import/export envelope version. */
export const createTournamentInputSchema = tournamentSetupSchema.omit({ schemaVersion: true });
export type CreateTournamentInput = z.infer<typeof createTournamentInputSchema>;

/** Import = the full versioned setup envelope. */
export const importSetupInputSchema = tournamentSetupSchema;
export type ImportSetupInput = z.infer<typeof importSetupInputSchema>;

export const userSyncInputSchema = z.object({
  provider: z.string().min(1),
  providerId: z.string().min(1),
  email: z.string().email(),
});
export type UserSyncInput = z.infer<typeof userSyncInputSchema>;

export const createCapabilityLinkInputSchema = z.object({
  type: z.enum(["VIEW", "SCORE"]),
  /** Optional lifetime; the server turns this into an absolute expiresAt. */
  expiresInHours: z.number().int().positive().max(8760).optional(),
});
export type CreateCapabilityLinkInput = z.infer<typeof createCapabilityLinkInputSchema>;

export const scoreInputSchema = z.object({
  opponent1Score: z.number().int().nonnegative(),
  opponent2Score: z.number().int().nonnegative(),
});
export type ScoreInput = z.infer<typeof scoreInputSchema>;

/** Body of PATCH /tournaments/:id/design — the token set to persist. */
export const updateDesignInputSchema = designTokensSchema;
export type UpdateDesignInput = z.infer<typeof updateDesignInputSchema>;

/** SSE payload: a change signal — clients refetch the detail on receipt. */
export const matchUpdateEventSchema = z.object({
  tournamentId: z.string(),
});
export type MatchUpdateEvent = z.infer<typeof matchUpdateEventSchema>;

// ---------------------------------------------------------------------------
// Read-models (DTOs returned by the API)
// ---------------------------------------------------------------------------

export const tournamentStatusSchema = z.enum(["DRAFT", "RUNNING", "COMPLETED"]);
export type TournamentStatus = z.infer<typeof tournamentStatusSchema>;

export const userTierSchema = z.enum(["FREE", "PRO"]);
export type UserTier = z.infer<typeof userTierSchema>;

export const userDtoSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  tier: userTierSchema,
});
export type UserDto = z.infer<typeof userDtoSchema>;

export const tournamentSummaryDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: tournamentStatusSchema,
  participantCount: z.number().int().nonnegative(),
  stageTypes: z.array(stageTypeSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TournamentSummaryDto = z.infer<typeof tournamentSummaryDtoSchema>;

export const matchSlotDtoSchema = z.object({
  participantId: z.string().nullable(),
  /** Resolved display label: participant name, "BYE", or a source description. */
  label: z.string(),
  score: z.number().nullable(),
});
export type MatchSlotDto = z.infer<typeof matchSlotDtoSchema>;

export const matchStatusSchema = z.enum(["PENDING", "RUNNING", "COMPLETED"]);
export type MatchStatus = z.infer<typeof matchStatusSchema>;

export const matchDtoSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  status: matchStatusSchema,
  opponent1: matchSlotDtoSchema.nullable(),
  opponent2: matchSlotDtoSchema.nullable(),
});
export type MatchDto = z.infer<typeof matchDtoSchema>;

export const roundDtoSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  name: z.string(),
  matches: z.array(matchDtoSchema),
});
export type RoundDto = z.infer<typeof roundDtoSchema>;

export const standingsRowDtoSchema = z.object({
  participantId: z.string(),
  name: z.string(),
  played: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  points: z.number().int(),
});
export type StandingsRowDto = z.infer<typeof standingsRowDtoSchema>;

export const groupDtoSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  rounds: z.array(roundDtoSchema),
  /** Populated for round-robin groups; null for elimination groups. */
  standings: z.array(standingsRowDtoSchema).nullable(),
});
export type GroupDto = z.infer<typeof groupDtoSchema>;

export const stageDtoSchema = z.object({
  id: z.string(),
  type: stageTypeSchema,
  number: z.number().int(),
  name: z.string(),
  groups: z.array(groupDtoSchema),
});
export type StageDto = z.infer<typeof stageDtoSchema>;

export const participantDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  seed: z.number().int().nullable(),
});
export type ParticipantDto = z.infer<typeof participantDtoSchema>;

export const tournamentDetailDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: tournamentStatusSchema,
  design: designTokensSchema.nullable(),
  participants: z.array(participantDtoSchema),
  stages: z.array(stageDtoSchema),
  /** Whether the current requester (owner or SCORE-link holder) may enter scores. */
  viewerCanScore: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TournamentDetailDto = z.infer<typeof tournamentDetailDtoSchema>;

export const capabilityLinkDtoSchema = z.object({
  id: z.string(),
  type: z.enum(["VIEW", "SCORE"]),
  token: z.string(),
  expiresAt: z.string().nullable(),
});
export type CapabilityLinkDto = z.infer<typeof capabilityLinkDtoSchema>;

// ---------------------------------------------------------------------------
// Saved themes (account feature) + reseeding (M2.1)
// ---------------------------------------------------------------------------

export const savedThemeDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  tokens: designTokensSchema,
  createdAt: z.string(),
});
export type SavedThemeDto = z.infer<typeof savedThemeDtoSchema>;

export const createSavedThemeInputSchema = z.object({
  name: z.string().min(1).max(60),
  tokens: designTokensSchema,
});
export type CreateSavedThemeInput = z.infer<typeof createSavedThemeInputSchema>;

/** Reorder participants (new seed order) and regenerate the bracket — DRAFT only. */
export const reseedInputSchema = z.object({
  participantIds: z.array(z.string()).min(2),
});
export type ReseedInput = z.infer<typeof reseedInputSchema>;
