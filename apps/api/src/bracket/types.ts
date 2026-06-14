import { StageType } from "@tournamentify/shared";

/**
 * Pure, DB-free description of a generated bracket. The persistence slice maps
 * these shapes onto Prisma Stage/Group/Round/Match rows; the renderer reads the
 * same shapes. `participantIndex` is the 0-based index into the input
 * participants array (seed s maps to participantIndex s-1).
 */

export interface GeneratedSlot {
  kind: "participant" | "bye" | "source" | "empty";
  participantIndex?: number;
  source?: {
    type: "winner_of" | "loser_of";
    round: number;
    match: number;
  };
}

export interface GeneratedMatch {
  number: number;
  opponent1: GeneratedSlot;
  opponent2: GeneratedSlot;
}

export interface GeneratedRound {
  number: number;
  name: string;
  matches: GeneratedMatch[];
}

export interface GeneratedGroup {
  number: number;
  rounds: GeneratedRound[];
}

export interface GeneratedStage {
  type: StageType;
  name: string;
  groups: GeneratedGroup[];
}
