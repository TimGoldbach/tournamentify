import { StandingsRowDto } from "@tournamentify/shared";

/**
 * Pure progression + standings helpers. No DB, no Nest, no I/O — given the same
 * inputs they always produce the same output, so they can be exhaustively unit
 * tested and reasoned about. The persistence slice feeds these the raw stored
 * opponent JSON and applies the returned updates inside its own transaction.
 */

// ---------------------------------------------------------------------------
// Stored opponent-slot JSON (mirrors what M1 persists on Match.opponentN)
// ---------------------------------------------------------------------------

export interface ParticipantSlot {
  participantId: string;
  score?: number;
}

export interface ByeSlot {
  bye: true;
}

export interface SourceSlot {
  source: {
    type: "winner_of" | "loser_of";
    round: number;
    match: number;
  };
}

export type Slot = ParticipantSlot | ByeSlot | SourceSlot | null;

/**
 * A match as the progression code sees it: identity, position within its group
 * (1-based round/match), and the raw stored JSON for each opponent slot.
 */
export interface MatchView {
  id: string;
  roundNumber: number;
  matchNumber: number;
  opponent1: unknown;
  opponent2: unknown;
}

export interface AdvancementUpdate {
  matchId: string;
  slot: "opponent1" | "opponent2";
  participantId: string;
}

export interface ByeAdvancement {
  matchId: string;
  status: "COMPLETED";
  winnerParticipantId: string;
  advance: AdvancementUpdate[];
}

// ---------------------------------------------------------------------------
// Slot parsing — narrow `unknown` raw JSON into a discriminated Slot
// ---------------------------------------------------------------------------

export function parseSlot(raw: unknown): Slot {
  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.participantId === "string") {
    const slot: ParticipantSlot = { participantId: obj.participantId };
    if (typeof obj.score === "number") {
      slot.score = obj.score;
    }
    return slot;
  }
  if (obj.bye === true) {
    return { bye: true };
  }
  const source = obj.source;
  if (source && typeof source === "object" && !Array.isArray(source)) {
    const s = source as Record<string, unknown>;
    if (
      (s.type === "winner_of" || s.type === "loser_of") &&
      typeof s.round === "number" &&
      typeof s.match === "number"
    ) {
      return { source: { type: s.type, round: s.round, match: s.match } };
    }
  }
  return null;
}

function isParticipantSlot(slot: Slot): slot is ParticipantSlot {
  return slot !== null && "participantId" in slot;
}

function isByeSlot(slot: Slot): slot is ByeSlot {
  return slot !== null && "bye" in slot && slot.bye === true;
}

function isWinnerSourceFor(slot: Slot, round: number, match: number): boolean {
  if (slot === null || !("source" in slot)) {
    return false;
  }
  const { source } = slot;
  return source.type === "winner_of" && source.round === round && source.match === match;
}

// ---------------------------------------------------------------------------
// Advancement
// ---------------------------------------------------------------------------

/**
 * Given a just-completed match (by 1-based round/match within the group) and its
 * winner, find every downstream slot that sources from `winner_of(round, match)`
 * and return one update per matching slot carrying the winner's participantId.
 *
 * `loser_of` is intentionally not handled here — M2 is single-elimination only —
 * but the slot shape is preserved so double-elim can reuse the scan unchanged.
 */
export function winnerAdvancement(
  group: { matches: MatchView[] },
  completed: { roundNumber: number; matchNumber: number; winnerParticipantId: string },
): AdvancementUpdate[] {
  const updates: AdvancementUpdate[] = [];
  for (const match of group.matches) {
    const slot1 = parseSlot(match.opponent1);
    if (isWinnerSourceFor(slot1, completed.roundNumber, completed.matchNumber)) {
      updates.push({
        matchId: match.id,
        slot: "opponent1",
        participantId: completed.winnerParticipantId,
      });
    }
    const slot2 = parseSlot(match.opponent2);
    if (isWinnerSourceFor(slot2, completed.roundNumber, completed.matchNumber)) {
      updates.push({
        matchId: match.id,
        slot: "opponent2",
        participantId: completed.winnerParticipantId,
      });
    }
  }
  return updates;
}

/**
 * Detect bye matches — exactly one participant slot and one bye slot — and treat
 * the lone participant as the automatic winner. For each, also compute the
 * downstream advancement so the caller can seat the winner into the next round.
 *
 * With standard seeding byes only occur in round 1 and never on both sides, so a
 * single pass is correct: a downstream slot sourced from a bye match is filled
 * here, never itself a bye that would need a further pass.
 */
export function byeAdvancements(group: { matches: MatchView[] }): ByeAdvancement[] {
  const result: ByeAdvancement[] = [];
  for (const match of group.matches) {
    const slot1 = parseSlot(match.opponent1);
    const slot2 = parseSlot(match.opponent2);

    let winnerParticipantId: string | null = null;
    if (isParticipantSlot(slot1) && isByeSlot(slot2)) {
      winnerParticipantId = slot1.participantId;
    } else if (isByeSlot(slot1) && isParticipantSlot(slot2)) {
      winnerParticipantId = slot2.participantId;
    }
    if (winnerParticipantId === null) {
      continue;
    }

    result.push({
      matchId: match.id,
      status: "COMPLETED",
      winnerParticipantId,
      advance: winnerAdvancement(group, {
        roundNumber: match.roundNumber,
        matchNumber: match.matchNumber,
        winnerParticipantId,
      }),
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Standings (round-robin)
// ---------------------------------------------------------------------------

interface MutableRow {
  participantId: string;
  name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
}

/**
 * Round-robin table built from COMPLETED matches only. A match counts as scored
 * when BOTH opponents are participant slots carrying a numeric `score`. Higher
 * score wins (3 pts), equal score is a draw (1 pt each), loss scores 0.
 *
 * Every participant that appears in any match of the group is included, even if
 * none of their matches are scored yet (played 0). Sorted by points desc, then
 * wins desc, then name asc.
 */
export function computeStandings(
  group: { matches: MatchView[] },
  participantNames: Map<string, string>,
): StandingsRowDto[] {
  const rows = new Map<string, MutableRow>();

  const ensure = (participantId: string): MutableRow => {
    let row = rows.get(participantId);
    if (!row) {
      row = {
        participantId,
        name: participantNames.get(participantId) ?? "",
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        points: 0,
      };
      rows.set(participantId, row);
    }
    return row;
  };

  for (const match of group.matches) {
    const slot1 = parseSlot(match.opponent1);
    const slot2 = parseSlot(match.opponent2);

    // Register every participant that appears, regardless of scoring.
    if (isParticipantSlot(slot1)) {
      ensure(slot1.participantId);
    }
    if (isParticipantSlot(slot2)) {
      ensure(slot2.participantId);
    }

    // Only fully-scored matches between two participants contribute results.
    if (
      !isParticipantSlot(slot1) ||
      !isParticipantSlot(slot2) ||
      typeof slot1.score !== "number" ||
      typeof slot2.score !== "number"
    ) {
      continue;
    }

    const rowA = ensure(slot1.participantId);
    const rowB = ensure(slot2.participantId);
    rowA.played += 1;
    rowB.played += 1;

    if (slot1.score > slot2.score) {
      rowA.wins += 1;
      rowA.points += 3;
      rowB.losses += 1;
    } else if (slot1.score < slot2.score) {
      rowB.wins += 1;
      rowB.points += 3;
      rowA.losses += 1;
    } else {
      rowA.draws += 1;
      rowB.draws += 1;
      rowA.points += 1;
      rowB.points += 1;
    }
  }

  return Array.from(rows.values()).sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points;
    }
    if (b.wins !== a.wins) {
      return b.wins - a.wins;
    }
    return a.name.localeCompare(b.name) || a.participantId.localeCompare(b.participantId);
  });
}
