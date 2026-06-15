"use client";

import { useTranslations } from "next-intl";
import { useParams, useSearchParams } from "next/navigation";
import { useScoreMatch, useTournament } from "@/lib/queries";
import { useTournamentEvents } from "@/lib/useTournamentEvents";
import type { MatchDto } from "@tournamentify/shared";
import { StageView } from "@/components/bracket/StageView";
import { RoundRobinMatches } from "@/components/RoundRobinMatches";
import { designToStyle } from "@/components/bracket/design";
import { ScoreableMatch } from "@/components/ScoreableMatch";

export const dynamic = "force-dynamic";

/**
 * Public live viewer. Reachable via a capability link (`?token=…`): VIEW links
 * render the bracket read-only, SCORE links (where `viewerCanScore`) swap each
 * elimination node for an inline scoring control. An SSE subscription keeps the
 * view live as scores land from any device.
 */

function ViewerContent() {
  const t = useTranslations("publicView");
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params.id;
  const token = searchParams.get("token") ?? undefined;

  const { data, isLoading, isError, error } = useTournament(id, token);
  const scoreMatch = useScoreMatch(id, token);

  // Keep the cached detail fresh as scores are entered from any client.
  useTournamentEvents(id, token, Boolean(id));

  if (isLoading) {
    return (
      <main className="mx-auto max-w-5xl p-8">
        <p className="text-muted-foreground">{t("loading")}</p>
      </main>
    );
  }

  if (isError || !data) {
    // A missing/invalid token surfaces as a request failure from the BFF.
    const message = error instanceof Error ? error.message : "";
    const isNotFound = /\b(401|403|404)\b/.test(message);
    return (
      <main className="mx-auto max-w-5xl p-8">
        <p className="text-red-600">{isNotFound ? t("notFound") : t("loadError")}</p>
      </main>
    );
  }

  const canScore = data.viewerCanScore;

  const renderMatch = (match: MatchDto) => (
    <ScoreableMatch
      match={match}
      canScore={canScore}
      pending={scoreMatch.isPending}
      onScore={(matchId, opponent1Score, opponent2Score) =>
        scoreMatch.mutate({ matchId, input: { opponent1Score, opponent2Score } })
      }
    />
  );

  return (
    <main className="mx-auto max-w-5xl p-8">
      <div style={designToStyle(data.design)}>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="text-2xl font-bold">{data.name}</h1>
          <span className="mt-1 inline-block rounded-full border border-black/10 px-2 py-0.5 text-xs text-muted-foreground dark:border-white/15">
            {canScore ? t("scoringEnabled") : t("liveView")}
          </span>
        </header>

        {data.stages.map((stage) => (
          <div key={stage.id}>
            <StageView stage={stage} renderMatch={renderMatch} />
            {stage.type === "round_robin" ? (
              <RoundRobinMatches stage={stage} renderMatch={renderMatch} />
            ) : null}
          </div>
        ))}
      </div>
    </main>
  );
}

export default function PublicTournamentPage() {
  return <ViewerContent />;
}
