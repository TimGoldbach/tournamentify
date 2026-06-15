import type { ReactNode } from "react";
import type { MatchDto, StageDto } from "@tournamentify/shared";

/**
 * Round-robin groups render a standings table in StageView; the matches
 * themselves still need to be shown (and scored), so this renders every
 * round-robin group's matches as a flat list using the provided renderMatch.
 * Shared by the owner editor and the public viewer so scoring is reachable
 * for round-robin on both.
 */
export function RoundRobinMatches({
  stage,
  renderMatch,
}: {
  stage: StageDto;
  renderMatch: (match: MatchDto) => ReactNode;
}) {
  const groups = stage.groups.filter((group) => group.standings != null);
  if (groups.length === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {groups.flatMap((group) =>
        group.rounds.flatMap((round) =>
          round.matches.map((match) => <div key={match.id}>{renderMatch(match)}</div>),
        ),
      )}
    </div>
  );
}
