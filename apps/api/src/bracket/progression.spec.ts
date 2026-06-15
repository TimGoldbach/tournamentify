import { describe, expect, it } from "vitest";
import { BracketGenerator } from "./bracket-generator.service";
import {
  byeAdvancements,
  computeStandings,
  loserAdvancement,
  winnerAdvancement,
  type MatchView,
} from "./progression";
import type { GeneratedSlot } from "./types";

describe("winnerAdvancement", () => {
  it("seats the winner into every slot that sources from the completed match", () => {
    const matches = [
      {
        id: "r2m1",
        roundNumber: 2,
        matchNumber: 1,
        opponent1: { source: { type: "winner_of", round: 1, match: 1 } },
        opponent2: { source: { type: "winner_of", round: 1, match: 2 } },
      },
    ];
    const updates = winnerAdvancement(
      { matches },
      { roundNumber: 1, matchNumber: 1, winnerParticipantId: "P1" },
    );
    expect(updates).toEqual([{ matchId: "r2m1", slot: "opponent1", participantId: "P1" }]);
  });

  it("returns nothing when no downstream slot sources from the match", () => {
    const matches = [
      {
        id: "x",
        roundNumber: 2,
        matchNumber: 1,
        opponent1: { participantId: "A" },
        opponent2: { bye: true },
      },
    ];
    expect(
      winnerAdvancement({ matches }, { roundNumber: 1, matchNumber: 5, winnerParticipantId: "P" }),
    ).toEqual([]);
  });
});

describe("byeAdvancements", () => {
  it("auto-completes a participant-vs-bye match and advances the participant", () => {
    const matches = [
      {
        id: "r1m1",
        roundNumber: 1,
        matchNumber: 1,
        opponent1: { participantId: "P1" },
        opponent2: { bye: true },
      },
      {
        id: "r2m1",
        roundNumber: 2,
        matchNumber: 1,
        opponent1: { source: { type: "winner_of", round: 1, match: 1 } },
        opponent2: { source: { type: "winner_of", round: 1, match: 2 } },
      },
    ];
    const byes = byeAdvancements({ matches });
    expect(byes).toHaveLength(1);
    expect(byes[0]).toMatchObject({
      matchId: "r1m1",
      status: "COMPLETED",
      winnerParticipantId: "P1",
    });
    expect(byes[0].advance).toEqual([
      { matchId: "r2m1", slot: "opponent1", participantId: "P1" },
    ]);
  });

  it("ignores real (two-participant) matches", () => {
    const matches = [
      {
        id: "m",
        roundNumber: 1,
        matchNumber: 1,
        opponent1: { participantId: "A" },
        opponent2: { participantId: "B" },
      },
    ];
    expect(byeAdvancements({ matches })).toEqual([]);
  });
});

describe("computeStandings", () => {
  const names = new Map([
    ["A", "Alice"],
    ["B", "Bob"],
    ["C", "Cara"],
  ]);

  it("tallies wins/draws/losses and points, sorted points→wins→name", () => {
    const matches = [
      {
        id: "1",
        roundNumber: 1,
        matchNumber: 1,
        opponent1: { participantId: "A", score: 2 },
        opponent2: { participantId: "B", score: 1 },
      }, // A wins
      {
        id: "2",
        roundNumber: 2,
        matchNumber: 1,
        opponent1: { participantId: "A", score: 1 },
        opponent2: { participantId: "C", score: 1 },
      }, // draw
      {
        id: "3",
        roundNumber: 3,
        matchNumber: 1,
        opponent1: { participantId: "B", score: 0 },
        opponent2: { participantId: "C", score: 3 },
      }, // C wins
    ];
    const table = computeStandings({ matches }, names);
    // A: 4pts(1W,1D), C: 4pts(1W,1D) — tie broken by name (Alice<Cara); B: 0pts.
    expect(table.map((r) => r.participantId)).toEqual(["A", "C", "B"]);
    expect(table[0]).toMatchObject({ played: 2, wins: 1, draws: 1, losses: 0, points: 4 });
    expect(table[2]).toMatchObject({ participantId: "B", wins: 0, losses: 2, points: 0 });
  });

  it("includes participants with no scored matches yet (played 0)", () => {
    const matches = [
      {
        id: "1",
        roundNumber: 1,
        matchNumber: 1,
        opponent1: { participantId: "A" },
        opponent2: { participantId: "B" },
      },
    ];
    const table = computeStandings({ matches }, names);
    expect(table).toHaveLength(2);
    expect(table.every((r) => r.played === 0)).toBe(true);
  });
});

describe("loserAdvancement", () => {
  it("seats the loser into every slot that sources from loser_of(round, match)", () => {
    const matches = [
      {
        id: "lb1m1",
        roundNumber: 3,
        matchNumber: 1,
        opponent1: { source: { type: "loser_of", round: 1, match: 1 } },
        opponent2: { source: { type: "loser_of", round: 1, match: 2 } },
      },
    ];
    const updates = loserAdvancement(
      { matches },
      { roundNumber: 1, matchNumber: 1, loserParticipantId: "L1" },
    );
    expect(updates).toEqual([{ matchId: "lb1m1", slot: "opponent1", participantId: "L1" }]);
  });

  it("ignores winner_of slots and unrelated matches", () => {
    const matches = [
      {
        id: "wf",
        roundNumber: 2,
        matchNumber: 1,
        opponent1: { source: { type: "winner_of", round: 1, match: 1 } },
        opponent2: { source: { type: "winner_of", round: 1, match: 2 } },
      },
    ];
    expect(
      loserAdvancement({ matches }, { roundNumber: 1, matchNumber: 1, loserParticipantId: "L" }),
    ).toEqual([]);
  });
});

describe("double-elimination full simulation", () => {
  const gen = new BracketGenerator();

  type SimMatch = {
    id: string;
    roundNumber: number;
    matchNumber: number;
    opponent1: unknown;
    opponent2: unknown;
    completed: boolean;
    winnerId: string | null;
  };

  /** Translate a generated slot into the stored JSON the DB would hold. */
  const slotJson = (slot: GeneratedSlot): unknown => {
    if (slot.kind === "participant") {
      return { participantId: `P${slot.participantIndex}` };
    }
    if (slot.kind === "source") {
      return { source: { ...slot.source } };
    }
    if (slot.kind === "bye") {
      return { bye: true };
    }
    return null;
  };

  const resolvedId = (raw: unknown): string | null => {
    if (raw && typeof raw === "object" && "participantId" in (raw as Record<string, unknown>)) {
      const pid = (raw as Record<string, unknown>).participantId;
      return typeof pid === "string" ? pid : null;
    }
    return null;
  };

  const applyUpdate = (
    matches: SimMatch[],
    update: { matchId: string; slot: "opponent1" | "opponent2"; participantId: string },
  ): void => {
    const target = matches.find((m) => m.id === update.matchId)!;
    target[update.slot] = { participantId: update.participantId };
  };

  /**
   * Build the mutable match list, then deterministically resolve every match by
   * always declaring opponent1 the winner. Returns the simulation outcome.
   */
  const simulate = (n: number) => {
    const group = gen.generateStage({ type: "double_elimination", name: "Main", settings: {} }, n)
      .groups[0];

    const matches: SimMatch[] = [];
    for (const round of group.rounds) {
      for (const m of round.matches) {
        matches.push({
          id: `R${round.number}M${m.number}`,
          roundNumber: round.number,
          matchNumber: m.number,
          opponent1: slotJson(m.opponent1),
          opponent2: slotJson(m.opponent2),
          completed: false,
          winnerId: null,
        });
      }
    }

    const views = (): MatchView[] =>
      matches.map((m) => ({
        id: m.id,
        roundNumber: m.roundNumber,
        matchNumber: m.matchNumber,
        opponent1: m.opponent1,
        opponent2: m.opponent2,
      }));

    // Track how many times each participant has lost, to prove the LB path.
    const losses = new Map<string, number>();
    // Track which participants reached the Grand Final (round = last round).
    const gfRoundNumber = group.rounds[group.rounds.length - 1].number;
    const reachedGrandFinal = new Set<string>();

    let progress = true;
    while (progress) {
      progress = false;
      for (const m of matches) {
        if (m.completed) {
          continue;
        }
        const id1 = resolvedId(m.opponent1);
        const id2 = resolvedId(m.opponent2);
        if (id1 === null || id2 === null) {
          continue;
        }

        // Deterministic: opponent1 always wins.
        const winnerId = id1;
        const loserId = id2;
        m.completed = true;
        m.winnerId = winnerId;

        if (m.roundNumber === gfRoundNumber) {
          // Record GF participants but do NOT count the GF loss — we want the
          // loss tally accrued on the *path to* the Grand Final.
          reachedGrandFinal.add(id1);
          reachedGrandFinal.add(id2);
        } else {
          losses.set(loserId, (losses.get(loserId) ?? 0) + 1);
        }

        for (const u of winnerAdvancement(
          { matches: views() },
          { roundNumber: m.roundNumber, matchNumber: m.matchNumber, winnerParticipantId: winnerId },
        )) {
          applyUpdate(matches, u);
        }
        for (const u of loserAdvancement(
          { matches: views() },
          { roundNumber: m.roundNumber, matchNumber: m.matchNumber, loserParticipantId: loserId },
        )) {
          applyUpdate(matches, u);
        }
        progress = true;
      }
    }

    return { matches, gfRoundNumber, reachedGrandFinal, losses };
  };

  for (const n of [4, 8]) {
    it(`N=${n}: every match completes and the Grand Final crowns an undefeated champion`, () => {
      const { matches, gfRoundNumber, losses } = simulate(n);

      // Every match was resolvable and got completed.
      expect(matches.every((m) => m.completed)).toBe(true);
      expect(matches).toHaveLength(2 * n - 2);

      // The Grand Final is a single decisive match (no bracket reset).
      const finals = matches.filter((m) => m.roundNumber === gfRoundNumber);
      expect(finals).toHaveLength(1);

      const gf = finals[0];
      expect(gf.winnerId).not.toBeNull();
      // opponent1 always wins, so the champion is the WB finalist who came
      // through the winner bracket undefeated — a real constraint on the GF
      // wiring (a mis-wired GF would crown someone carrying a loss).
      expect(losses.get(gf.winnerId!) ?? 0).toBe(0);
    });

    it(`N=${n}: a player who lost once still reaches the Grand Final (LB path is wired)`, () => {
      const { reachedGrandFinal, losses } = simulate(n);

      // Two players reach the GF: the WB champion (0 losses) and the LB
      // champion (exactly 1 loss at the point it dropped to the LB).
      expect(reachedGrandFinal.size).toBe(2);
      const lbFinalist = [...reachedGrandFinal].find((p) => (losses.get(p) ?? 0) >= 1);
      expect(lbFinalist).toBeDefined();
      // The LB finalist lost exactly once before the Grand Final began.
      expect(losses.get(lbFinalist!)).toBe(1);
    });
  }
});
