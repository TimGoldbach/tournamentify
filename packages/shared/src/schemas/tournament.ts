import { z } from "zod";

/**
 * Single source of truth for the tournament domain — consumed by the Next
 * frontend, the Nest backend (request validation), and the JSON import/export
 * feature. If a shape changes here, every layer changes with it.
 */

/** Bump when the import/export setup format changes in a breaking way. */
export const SETUP_SCHEMA_VERSION = 1;

export const stageTypeSchema = z.enum([
  "single_elimination",
  "double_elimination",
  "round_robin",
  "swiss",
]);
export type StageType = z.infer<typeof stageTypeSchema>;

export const participantSetupSchema = z.object({
  name: z.string().min(1),
  seed: z.number().int().positive().optional(),
});
export type ParticipantSetup = z.infer<typeof participantSetupSchema>;

export const stageSetupSchema = z.object({
  type: stageTypeSchema,
  name: z.string().min(1),
  /** Format-specific options (best-of, group size, swiss rounds, …). */
  settings: z.record(z.unknown()).default({}),
});
export type StageSetup = z.infer<typeof stageSetupSchema>;

/** Token-based theme — presets + user overrides, never raw CSS. */
export const designTokensSchema = z.object({
  preset: z.string().optional(),
  nodeBg: z.string().optional(),
  connector: z.string().optional(),
  radius: z.string().optional(),
});
export type DesignTokens = z.infer<typeof designTokensSchema>;

/**
 * Import/Export payload = SETUP ONLY (no results), versioned.
 * The same schema validates incoming JSON at the Nest boundary.
 */
export const tournamentSetupSchema = z.object({
  schemaVersion: z.literal(SETUP_SCHEMA_VERSION),
  name: z.string().min(1),
  stages: z.array(stageSetupSchema).min(1),
  participants: z.array(participantSetupSchema),
  design: designTokensSchema.optional(),
});
export type TournamentSetup = z.infer<typeof tournamentSetupSchema>;
