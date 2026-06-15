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

describe("unsupported formats", () => {
  it("throws for double_elimination and swiss", () => {
    expect(() => gen.generateStage(stage("double_elimination"), 4)).toThrow();
    expect(() => gen.generateStage(stage("swiss"), 4)).toThrow();
  });
});
