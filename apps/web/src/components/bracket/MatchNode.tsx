import type { ReactNode } from "react";
import type { MatchDto, MatchSlotDto } from "@tournamentify/shared";

/**
 * Read-only presentation of a single match as a card. Two opponent rows with
 * a right-aligned score, a divider, and winner emphasis once the match is
 * COMPLETED and one slot scored higher. Colors/radius come from the
 * --bracket-* CSS variables so token-based themes restyle it for free.
 */

interface MatchNodeProps {
  match: MatchDto;
  /** Rendered beneath the node — used by the scoring slice to inject an edit affordance. */
  footer?: ReactNode;
}

const TBD = "TBD";

function slotLabel(slot: MatchSlotDto | null): string {
  if (!slot) return TBD;
  return slot.label || TBD;
}

/**
 * Which opponent (if any) won. Only meaningful for a COMPLETED match where
 * both slots carry a numeric score and the scores differ.
 */
function winnerOf(match: MatchDto): 1 | 2 | null {
  if (match.status !== "COMPLETED") return null;
  const a = match.opponent1?.score ?? null;
  const b = match.opponent2?.score ?? null;
  if (a === null || b === null || a === b) return null;
  return a > b ? 1 : 2;
}

function SlotRow({ slot, isWinner }: { slot: MatchSlotDto | null; isWinner: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={"truncate" + (isWinner ? " font-semibold text-foreground" : "")}>
        {slotLabel(slot)}
      </span>
      <span
        className={
          "tabular-nums " + (isWinner ? "font-semibold text-foreground" : "text-muted-foreground")
        }
      >
        {slot?.score ?? ""}
      </span>
    </div>
  );
}

export function MatchNode({ match, footer }: MatchNodeProps) {
  const winner = winnerOf(match);

  return (
    <div className="w-56">
      <div
        className="border border-black/10 p-3 text-sm shadow-sm dark:border-white/10"
        style={{
          backgroundColor: "hsl(var(--bracket-node-bg))",
          borderRadius: "var(--bracket-radius)",
        }}
      >
        <div className="space-y-1">
          <SlotRow slot={match.opponent1} isWinner={winner === 1} />
          <div className="h-px bg-black/10 dark:bg-white/10" />
          <SlotRow slot={match.opponent2} isWinner={winner === 2} />
        </div>
      </div>
      {footer ? <div className="mt-1">{footer}</div> : null}
    </div>
  );
}
