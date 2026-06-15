import type { StandingsRowDto } from "@tournamentify/shared";

/**
 * Round-robin standings as a compact table. Column headers use the German
 * shorthand the rest of the app uses: Sp (Spiele/played), S (Siege/wins),
 * U (Unentschieden/draws), N (Niederlagen/losses), Pkt (Punkte/points).
 * Read-only and dependency-free.
 */

interface StandingsTableProps {
  standings: StandingsRowDto[];
}

const numCell = "px-3 py-2 text-right tabular-nums";
const headNum = "px-3 py-2 text-right font-medium";

export function StandingsTable({ standings }: StandingsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b border-black/10 text-muted-foreground dark:border-white/10">
            <th className="px-3 py-2 text-right font-medium">#</th>
            <th className="px-3 py-2 text-left font-medium">Name</th>
            <th className={headNum}>Sp</th>
            <th className={headNum}>S</th>
            <th className={headNum}>U</th>
            <th className={headNum}>N</th>
            <th className={headNum}>Pkt</th>
          </tr>
        </thead>
        <tbody>
          {standings.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">
                —
              </td>
            </tr>
          ) : null}
          {standings.map((row, index) => (
            <tr
              key={row.participantId}
              className={index % 2 === 1 ? "bg-black/5 dark:bg-white/5" : undefined}
            >
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                {index + 1}
              </td>
              <td className="px-3 py-2 text-left">{row.name}</td>
              <td className={numCell + " text-muted-foreground"}>{row.played}</td>
              <td className={numCell}>{row.wins}</td>
              <td className={numCell}>{row.draws}</td>
              <td className={numCell}>{row.losses}</td>
              <td className={numCell + " font-semibold"}>{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
