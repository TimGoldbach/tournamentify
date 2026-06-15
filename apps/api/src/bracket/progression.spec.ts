import { describe, expect, it } from "vitest";
import { byeAdvancements, computeStandings, winnerAdvancement } from "./progression";

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
