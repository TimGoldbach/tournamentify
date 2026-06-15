import type { ReactNode } from "react";
import type { GroupDto, MatchDto, StageDto } from "@tournamentify/shared";
import { MatchNode } from "./MatchNode";

/**
 * Elimination bracket layout: each group's rounds become horizontal flex
 * columns (a round title above its match nodes). Connector elbows are drawn
 * between consecutive rounds with the --bracket-connector colour using static
 * bordered elements — no runtime DOM measurement, so it renders deterministically
 * on the server and the client. Overflows scroll horizontally.
 */

interface BracketViewProps {
  stage: StageDto;
  /** Wrap each node (e.g. to add a scoring affordance). Falls back to read-only MatchNode. */
  renderMatch?: (match: MatchDto) => ReactNode;
}

/** A vertical run of connector segments bridging one round to the next. */
function RoundConnector() {
  return (
    <div
      aria-hidden
      className="mx-1 w-4 shrink-0 self-stretch border-l"
      style={{ borderColor: "hsl(var(--bracket-connector))" }}
    />
  );
}

function GroupBracket({
  group,
  renderMatch,
}: {
  group: GroupDto;
  renderMatch?: (match: MatchDto) => ReactNode;
}) {
  return (
    <div className="flex items-stretch gap-0 overflow-x-auto pb-2">
      {group.rounds.map((round, index) => (
        <div key={round.id} className="flex items-stretch">
          <div className="flex min-w-max flex-col gap-3 px-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {round.name}
            </h4>
            <div className="flex flex-1 flex-col justify-around gap-3">
              {round.matches.map((match) => (
                <div key={match.id}>
                  {renderMatch ? renderMatch(match) : <MatchNode match={match} />}
                </div>
              ))}
            </div>
          </div>
          {index < group.rounds.length - 1 ? <RoundConnector /> : null}
        </div>
      ))}
    </div>
  );
}

export function BracketView({ stage, renderMatch }: BracketViewProps) {
  return (
    <div className="space-y-4">
      {stage.groups.map((group) => (
        <GroupBracket key={group.id} group={group} renderMatch={renderMatch} />
      ))}
    </div>
  );
}
