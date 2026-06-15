import { describe, expect, it } from "vitest";
import type { StageType } from "@tournamentify/shared";
import { BracketGenerator } from "./bracket-generator.service";
import type { GeneratedSlot } from "./types";

const gen = new BracketGenerator();
const stage = (type: StageType) => ({ type, name: "Main", settings: {} });
const idx = (slot: GeneratedSlot) => slot.participantIndex;

describe("single_elimination", () => {
  it("4 entrants → 2 rounds, round 1 pairs by standard seed order (1v4, 2v3)", () => {
    const group = gen.generateStage(stage("single_elimination"), 4).groups[0];
    expect(group.rounds.map((r) => r.matches.length)).toEqual([2, 1]);

    const r1 = group.rounds[0];
    // seed slots [1,4,2,3] → participantIndex [0,3,1,2]
    expect(idx(r1.matches[0].opponent1)).toBe(0);
    expect(idx(r1.matches[0].opponent2)).toBe(3);
    expect(idx(r1.matches[1].opponent1)).toBe(1);
    expect(idx(r1.matches[1].opponent2)).toBe(2);

    const final = group.rounds[1];
    expect(final.name).toBe("Finale");
    expect(final.matches[0].opponent1).toEqual({
      kind: "source",
      source: { type: "winner_of", round: 1, match: 1 },
    });
    expect(final.matches[0].opponent2).toEqual({
      kind: "source",
      source: { type: "winner_of", round: 1, match: 2 },
    });
  });

  it("3 entrants → bracket of 4 with one bye for the absent top seed's opponent", () => {
    const group = gen.generateStage(stage("single_elimination"), 3).groups[0];
    const r1 = group.rounds[0];
    expect(r1.matches[0].opponent1).toEqual({ kind: "participant", participantIndex: 0 });
    expect(r1.matches[0].opponent2).toEqual({ kind: "bye" });
  });

  it("8 entrants → 3 rounds named Runde 1 / Halbfinale / Finale", () => {
    const group = gen.generateStage(stage("single_elimination"), 8).groups[0];
    expect(group.rounds.map((r) => r.matches.length)).toEqual([4, 2, 1]);
    expect(group.rounds.map((r) => r.name)).toEqual(["Runde 1", "Halbfinale", "Finale"]);
  });
});

describe("round_robin (circle method)", () => {
  const pairsOf = (group: { rounds: { matches: { opponent1: GeneratedSlot; opponent2: GeneratedSlot }[] }[] }) =>
    group.rounds
      .flatMap((r) =>
        r.matches.map((m) => [idx(m.opponent1)!, idx(m.opponent2)!].sort((a, b) => a - b).join("-")),
      )
      .sort();

  it("4 entrants → 3 rounds, every pair exactly once", () => {
    const group = gen.generateStage(stage("round_robin"), 4).groups[0];
    expect(group.rounds).toHaveLength(3);
    expect(pairsOf(group)).toEqual(["0-1", "0-2", "0-3", "1-2", "1-3", "2-3"]);
  });

  it("3 entrants → bye dropped, each pair exactly once", () => {
    const group = gen.generateStage(stage("round_robin"), 3).groups[0];
    expect(pairsOf(group)).toEqual(["0-1", "0-2", "1-2"]);
  });
});

describe("double_elimination", () => {
  const winnerSrc = (round: number, match: number): GeneratedSlot => ({
    kind: "source",
    source: { type: "winner_of", round, match },
  });
  const loserSrc = (round: number, match: number): GeneratedSlot => ({
    kind: "source",
    source: { type: "loser_of", round, match },
  });
  const participant = (participantIndex: number): GeneratedSlot => ({
    kind: "participant",
    participantIndex,
  });

  it("N=4 → exact oracle structure (6 = 2N-2 matches)", () => {
    const group = gen.generateStage(stage("double_elimination"), 4).groups[0];

    expect(group.rounds.map((r) => r.number)).toEqual([1, 2, 3, 4, 5]);
    expect(group.rounds.map((r) => r.name)).toEqual([
      "WB Runde 1",
      "WB Finale",
      "LB Runde 1",
      "LB Finale",
      "Grand Final",
    ]);
    expect(group.rounds.map((r) => r.matches.length)).toEqual([2, 1, 1, 1, 1]);

    const [wb1, wbF, lb1, lbF, gf] = group.rounds;

    // 1 WB Runde 1: m1 [participant 0, participant 3], m2 [participant 1, participant 2]
    expect(wb1.matches[0].opponent1).toEqual(participant(0));
    expect(wb1.matches[0].opponent2).toEqual(participant(3));
    expect(wb1.matches[1].opponent1).toEqual(participant(1));
    expect(wb1.matches[1].opponent2).toEqual(participant(2));

    // 2 WB Finale: m1 [winner_of(1,1), winner_of(1,2)]
    expect(wbF.matches[0].opponent1).toEqual(winnerSrc(1, 1));
    expect(wbF.matches[0].opponent2).toEqual(winnerSrc(1, 2));

    // 3 LB Runde 1: m1 [loser_of(1,1), loser_of(1,2)]
    expect(lb1.matches[0].opponent1).toEqual(loserSrc(1, 1));
    expect(lb1.matches[0].opponent2).toEqual(loserSrc(1, 2));

    // 4 LB Finale: m1 [winner_of(3,1), loser_of(2,1)]
    expect(lbF.matches[0].opponent1).toEqual(winnerSrc(3, 1));
    expect(lbF.matches[0].opponent2).toEqual(loserSrc(2, 1));

    // 5 Grand Final: m1 [winner_of(2,1), winner_of(4,1)]
    expect(gf.matches[0].opponent1).toEqual(winnerSrc(2, 1));
    expect(gf.matches[0].opponent2).toEqual(winnerSrc(4, 1));
  });

  it("N=8 → exact oracle structure (14 = 2N-2 matches)", () => {
    const group = gen.generateStage(stage("double_elimination"), 8).groups[0];

    expect(group.rounds.map((r) => r.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(group.rounds.map((r) => r.name)).toEqual([
      "WB Runde 1",
      "WB Runde 2",
      "WB Finale",
      "LB Runde 1",
      "LB Runde 2",
      "LB Runde 3",
      "LB Finale",
      "Grand Final",
    ]);
    expect(group.rounds.map((r) => r.matches.length)).toEqual([4, 2, 1, 2, 2, 1, 1, 1]);

    const byNumber = (n: number) => group.rounds.find((r) => r.number === n)!;

    // 1 WB Runde 1: seed order [1,8,4,5,2,7,3,6] → participantIndex [0,7,3,4,1,6,2,5]
    const wb1 = byNumber(1);
    expect(wb1.matches[0].opponent1).toEqual(participant(0));
    expect(wb1.matches[0].opponent2).toEqual(participant(7));
    expect(wb1.matches[1].opponent1).toEqual(participant(3));
    expect(wb1.matches[1].opponent2).toEqual(participant(4));
    expect(wb1.matches[2].opponent1).toEqual(participant(1));
    expect(wb1.matches[2].opponent2).toEqual(participant(6));
    expect(wb1.matches[3].opponent1).toEqual(participant(2));
    expect(wb1.matches[3].opponent2).toEqual(participant(5));

    // 2 WB Runde 2
    const wb2 = byNumber(2);
    expect(wb2.matches[0].opponent1).toEqual(winnerSrc(1, 1));
    expect(wb2.matches[0].opponent2).toEqual(winnerSrc(1, 2));
    expect(wb2.matches[1].opponent1).toEqual(winnerSrc(1, 3));
    expect(wb2.matches[1].opponent2).toEqual(winnerSrc(1, 4));

    // 3 WB Finale
    const wbF = byNumber(3);
    expect(wbF.matches[0].opponent1).toEqual(winnerSrc(2, 1));
    expect(wbF.matches[0].opponent2).toEqual(winnerSrc(2, 2));

    // 4 LB Runde 1: pair consecutive WB-R1 losers
    const lb1 = byNumber(4);
    expect(lb1.matches[0].opponent1).toEqual(loserSrc(1, 1));
    expect(lb1.matches[0].opponent2).toEqual(loserSrc(1, 2));
    expect(lb1.matches[1].opponent1).toEqual(loserSrc(1, 3));
    expect(lb1.matches[1].opponent2).toEqual(loserSrc(1, 4));

    // 5 LB Runde 2 (minor): LB survivors vs WB-R2 losers, straight pairing
    const lb2 = byNumber(5);
    expect(lb2.matches[0].opponent1).toEqual(winnerSrc(4, 1));
    expect(lb2.matches[0].opponent2).toEqual(loserSrc(2, 1));
    expect(lb2.matches[1].opponent1).toEqual(winnerSrc(4, 2));
    expect(lb2.matches[1].opponent2).toEqual(loserSrc(2, 2));

    // 6 LB Runde 3 (major): LB survivors paired
    const lb3 = byNumber(6);
    expect(lb3.matches[0].opponent1).toEqual(winnerSrc(5, 1));
    expect(lb3.matches[0].opponent2).toEqual(winnerSrc(5, 2));

    // 7 LB Finale: LB survivor vs WB-final loser
    const lbF = byNumber(7);
    expect(lbF.matches[0].opponent1).toEqual(winnerSrc(6, 1));
    expect(lbF.matches[0].opponent2).toEqual(loserSrc(3, 1));

    // 8 Grand Final
    const gf = byNumber(8);
    expect(gf.matches[0].opponent1).toEqual(winnerSrc(3, 1));
    expect(gf.matches[0].opponent2).toEqual(winnerSrc(7, 1));
  });

  it("total match count is 2N-2 for N=4, 8, 16", () => {
    for (const n of [4, 8, 16]) {
      const group = gen.generateStage(stage("double_elimination"), n).groups[0];
      const total = group.rounds.reduce((sum, r) => sum + r.matches.length, 0);
      expect(total).toBe(2 * n - 2);
    }
  });

  it("throws for non-power-of-two participant counts", () => {
    expect(() => gen.generateStage(stage("double_elimination"), 6)).toThrow(
      "Double-Elimination unterstuetzt aktuell nur Teilnehmerzahlen, die eine Zweierpotenz sind (4, 8, 16, ...)",
    );
  });
});

describe("unsupported formats", () => {
  it("throws for swiss", () => {
    expect(() => gen.generateStage(stage("swiss"), 4)).toThrow();
  });
});
