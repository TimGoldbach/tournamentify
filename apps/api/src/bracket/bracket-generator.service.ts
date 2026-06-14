import { Injectable, NotImplementedException } from "@nestjs/common";
import { StageSetup } from "@tournamentify/shared";
import { GeneratedGroup, GeneratedMatch, GeneratedRound, GeneratedSlot, GeneratedStage } from "./types";

/**
 * Pure, deterministic bracket generator. No DB, no randomness, no external
 * libraries — given the same inputs it always produces the same structure.
 * Output uses 0-based participantIndex (seed s -> participantIndex s-1).
 */
@Injectable()
export class BracketGenerator {
  generateStage(stage: StageSetup, participantCount: number): GeneratedStage {
    switch (stage.type) {
      case "single_elimination":
        return this.generateSingleElimination(stage, participantCount);
      case "round_robin":
        return this.generateRoundRobin(stage, participantCount);
      case "double_elimination":
      case "swiss":
        throw new NotImplementedException(
          "Format wird ab M2/M3 unterstuetzt: " + stage.type,
        );
      default: {
        const _exhaustive: never = stage.type;
        throw new NotImplementedException(
          "Format wird ab M2/M3 unterstuetzt: " + String(_exhaustive),
        );
      }
    }
  }

  /**
   * Standard single-elimination seeding. The bracket size is the smallest power
   * of two >= max(count, 2); short fields are padded with byes. Slot order is
   * built by the classic mirror expansion so that top seeds meet only late:
   * starting from [1, 2], each pass doubles the list, appending for every seed
   * its complement (sum - seed) where sum = currentLength*2 + 1.
   */
  private generateSingleElimination(stage: StageSetup, participantCount: number): GeneratedStage {
    const count = Math.max(participantCount, 2);
    let size = 2;
    while (size < count) {
      size *= 2;
    }

    // Build the 1-based seed order for the bracket slots.
    let slots: number[] = [1, 2];
    while (slots.length < size) {
      const sum = slots.length * 2 + 1;
      const next: number[] = [];
      for (const s of slots) {
        next.push(s);
        next.push(sum - s);
      }
      slots = next;
    }

    const rounds = Math.log2(size);
    const generatedRounds: GeneratedRound[] = [];

    // Round 1: seat the seeded participants (or byes) into mirror-ordered slots.
    const firstRoundMatches: GeneratedMatch[] = [];
    const firstRoundMatchCount = size / 2;
    for (let i = 0; i < firstRoundMatchCount; i++) {
      const seedA = slots[2 * i];
      const seedB = slots[2 * i + 1];
      firstRoundMatches.push({
        number: i + 1,
        opponent1: this.seedSlot(seedA, participantCount),
        opponent2: this.seedSlot(seedB, participantCount),
      });
    }
    generatedRounds.push({
      number: 1,
      name: this.roundName(1, rounds),
      matches: firstRoundMatches,
    });

    // Subsequent rounds: each match feeds from the two winners below it.
    for (let r = 2; r <= rounds; r++) {
      const matchCount = size / Math.pow(2, r);
      const matches: GeneratedMatch[] = [];
      for (let m = 1; m <= matchCount; m++) {
        matches.push({
          number: m,
          opponent1: this.winnerSource(r - 1, 2 * m - 1),
          opponent2: this.winnerSource(r - 1, 2 * m),
        });
      }
      generatedRounds.push({
        number: r,
        name: this.roundName(r, rounds),
        matches,
      });
    }

    const group: GeneratedGroup = { number: 1, rounds: generatedRounds };
    return { type: stage.type, name: stage.name, groups: [group] };
  }

  /**
   * Round-robin via the circle method. With an odd field a virtual bye player
   * (-1) is added to make the count even; pairings touching -1 are dropped so a
   * player simply sits out that day. The first array slot stays fixed while the
   * rest rotate, yielding n-1 distinct rounds (Spieltage).
   */
  private generateRoundRobin(stage: StageSetup, participantCount: number): GeneratedStage {
    const players: number[] = [];
    for (let i = 0; i < participantCount; i++) {
      players.push(i);
    }
    if (players.length % 2 === 1) {
      players.push(-1); // bye marker
    }

    const n = players.length;
    const rounds = Math.max(n - 1, 0);
    const half = n / 2;
    const generatedRounds: GeneratedRound[] = [];

    const arr = players.slice();
    for (let r = 0; r < rounds; r++) {
      const matches: GeneratedMatch[] = [];
      let matchNumber = 1;
      for (let i = 0; i < half; i++) {
        const a = arr[i];
        const b = arr[n - 1 - i];
        if (a !== -1 && b !== -1) {
          matches.push({
            number: matchNumber++,
            opponent1: { kind: "participant", participantIndex: a },
            opponent2: { kind: "participant", participantIndex: b },
          });
        }
      }
      generatedRounds.push({
        number: r + 1,
        name: "Spieltag " + (r + 1),
        matches,
      });

      // Rotate everything except the fixed first slot.
      arr.splice(0, arr.length, arr[0], arr[n - 1], ...arr.slice(1, n - 1));
    }

    const group: GeneratedGroup = { number: 1, rounds: generatedRounds };
    return { type: stage.type, name: stage.name, groups: [group] };
  }

  /** A real entrant becomes a participant slot; an absent seed becomes a bye. */
  private seedSlot(seed: number, participantCount: number): GeneratedSlot {
    if (seed <= participantCount) {
      return { kind: "participant", participantIndex: seed - 1 };
    }
    return { kind: "bye" };
  }

  private winnerSource(round: number, match: number): GeneratedSlot {
    return { kind: "source", source: { type: "winner_of", round, match } };
  }

  private roundName(round: number, totalRounds: number): string {
    if (round === totalRounds) {
      return "Finale";
    }
    if (round === totalRounds - 1) {
      return "Halbfinale";
    }
    return "Runde " + round;
  }
}
