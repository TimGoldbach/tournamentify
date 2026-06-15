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
        return this.generateDoubleElimination(stage, participantCount);
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

  /**
   * Double-elimination for power-of-two fields (4, 8, 16, ...). One stage, one
   * group, with sequentially numbered rounds: the Winner Bracket (WB) first,
   * then the Loser Bracket (LB), then a single Grand Final (no bracket reset).
   *
   * Layout for k = log2(N):
   *   - WB rounds 1..k, with N/2^w matches in round w. Round 1 seats the seeds
   *     in the same mirror order as single-elimination; later rounds feed from
   *     the two WB winners below them.
   *   - LB rounds k+1 .. k+2(k-1) (group round numbers), 2(k-1) rounds total.
   *     LB round lr (1-based within the LB) has N/2^(ceil(lr/2)+1) matches.
   *       lr=1            pairs consecutive WB-R1 losers.
   *       lr even (minor) pairs each LB survivor with a fresh WB loser dropping
   *                       down from WB round (lr/2 + 1).
   *       lr odd >=3      pairs LB survivors against each other (major round).
   *   - Grand Final: WB champion vs LB champion.
   *
   * Total matches = 2N-2. Only power-of-two N is supported.
   */
  private generateDoubleElimination(stage: StageSetup, participantCount: number): GeneratedStage {
    const count = Math.max(participantCount, 2);
    if (!isPowerOfTwo(count) || count !== participantCount || participantCount < 2) {
      throw new NotImplementedException(
        "Double-Elimination unterstuetzt aktuell nur Teilnehmerzahlen, die eine Zweierpotenz sind (4, 8, 16, ...)",
      );
    }

    const size = count;
    const k = Math.log2(size);

    // WB round-1 seed slots: identical mirror expansion to single-elimination.
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

    const rounds: GeneratedRound[] = [];

    // --- Winner Bracket (rounds 1..k) ---------------------------------------
    const wbR1Matches: GeneratedMatch[] = [];
    for (let i = 0; i < size / 2; i++) {
      wbR1Matches.push({
        number: i + 1,
        opponent1: { kind: "participant", participantIndex: slots[2 * i] - 1 },
        opponent2: { kind: "participant", participantIndex: slots[2 * i + 1] - 1 },
      });
    }
    rounds.push({ number: 1, name: this.wbRoundName(1, k), matches: wbR1Matches });

    for (let w = 2; w <= k; w++) {
      const matchCount = size / Math.pow(2, w);
      const matches: GeneratedMatch[] = [];
      for (let m = 1; m <= matchCount; m++) {
        matches.push({
          number: m,
          opponent1: this.winnerSource(w - 1, 2 * m - 1),
          opponent2: this.winnerSource(w - 1, 2 * m),
        });
      }
      rounds.push({ number: w, name: this.wbRoundName(w, k), matches });
    }

    // --- Loser Bracket (group rounds k+1 .. k+2(k-1)) -----------------------
    const lbRoundCount = 2 * (k - 1);
    for (let lr = 1; lr <= lbRoundCount; lr++) {
      const groupRound = k + lr;
      const prevLbRound = k + lr - 1; // group round number of the previous LB round
      const matchCount = size / Math.pow(2, Math.ceil(lr / 2) + 1);
      const matches: GeneratedMatch[] = [];

      if (lr === 1) {
        // Pair consecutive WB round-1 losers.
        for (let m = 1; m <= matchCount; m++) {
          matches.push({
            number: m,
            opponent1: this.loserSource(1, 2 * m - 1),
            opponent2: this.loserSource(1, 2 * m),
          });
        }
      } else if (lr % 2 === 0) {
        // Minor round: LB survivor vs WB loser dropping from WB round (lr/2 + 1).
        const wbRound = lr / 2 + 1;
        for (let m = 1; m <= matchCount; m++) {
          matches.push({
            number: m,
            opponent1: this.winnerSource(prevLbRound, m),
            opponent2: this.loserSource(wbRound, m),
          });
        }
      } else {
        // Major round: pair consecutive LB survivors from the previous LB round.
        for (let m = 1; m <= matchCount; m++) {
          matches.push({
            number: m,
            opponent1: this.winnerSource(prevLbRound, 2 * m - 1),
            opponent2: this.winnerSource(prevLbRound, 2 * m),
          });
        }
      }

      rounds.push({ number: groupRound, name: this.lbRoundName(lr, lbRoundCount), matches });
    }

    // --- Grand Final --------------------------------------------------------
    const wbFinalRound = k;
    const lbFinalRound = k + lbRoundCount;
    const gfRound = lbFinalRound + 1;
    rounds.push({
      number: gfRound,
      name: "Grand Final",
      matches: [
        {
          number: 1,
          opponent1: this.winnerSource(wbFinalRound, 1),
          opponent2: this.winnerSource(lbFinalRound, 1),
        },
      ],
    });

    const group: GeneratedGroup = { number: 1, rounds };
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

  private loserSource(round: number, match: number): GeneratedSlot {
    return { kind: "source", source: { type: "loser_of", round, match } };
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

  /** WB round display name; the last WB round (k) is the WB Finale. */
  private wbRoundName(round: number, totalWbRounds: number): string {
    if (round === totalWbRounds) {
      return "WB Finale";
    }
    return "WB Runde " + round;
  }

  /** LB round display name (lr is 1-based within the LB); last LB round is the Finale. */
  private lbRoundName(lr: number, totalLbRounds: number): string {
    if (lr === totalLbRounds) {
      return "LB Finale";
    }
    return "LB Runde " + lr;
  }
}

function isPowerOfTwo(n: number): boolean {
  return n >= 1 && (n & (n - 1)) === 0;
}
