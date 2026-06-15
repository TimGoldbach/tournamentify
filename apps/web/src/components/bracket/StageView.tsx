import type { ReactNode } from "react";
import type { MatchDto, StageDto, StageType } from "@tournamentify/shared";
import { BracketView } from "./BracketView";
import { StandingsTable } from "./StandingsTable";

/**
 * Main presentational entry for a stage. Per group it renders a StandingsTable
 * when the group carries standings (round-robin) and an elimination BracketView
 * otherwise. The heading shows the stage name plus a small format hint.
 * Read-only by default; pass `renderMatch` to wrap each elimination node (e.g.
 * for the scoring affordance).
 */

interface StageViewProps {
  stage: StageDto;
  renderMatch?: (m: MatchDto) => ReactNode;
}

const formatHints: Record<StageType, string> = {
  single_elimination: "Single Elimination",
  double_elimination: "Double Elimination",
  round_robin: "Round Robin",
  swiss: "Schweizer System",
};

export function StageView({ stage, renderMatch }: StageViewProps) {
  const multiGroup = stage.groups.length > 1;

  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold">
        {stage.name}
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          {formatHints[stage.type] ?? stage.type}
        </span>
      </h2>

      {stage.groups.map((group) => (
        <div key={group.id} className="mt-4">
          {multiGroup ? (
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">
              Gruppe {group.number}
            </h3>
          ) : null}

          {group.standings !== null ? (
            <StandingsTable standings={group.standings} />
          ) : (
            <BracketView
              stage={{ ...stage, groups: [group] }}
              renderMatch={renderMatch}
            />
          )}
        </div>
      ))}
    </section>
  );
}
