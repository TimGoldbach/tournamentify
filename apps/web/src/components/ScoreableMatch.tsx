"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { MatchDto } from "@tournamentify/shared";
import { MatchNode } from "./bracket/MatchNode";
import { Button, Input } from "./ui";

interface ScoreableMatchProps {
  match: MatchDto;
  canScore: boolean;
  onScore: (matchId: string, opponent1Score: number, opponent2Score: number) => void;
  pending: boolean;
}

/** Parse a number input into a non-negative integer, falling back to 0. */
function toScore(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  return parsed;
}

/**
 * The read-only bracket node plus an inline scoring footer for the owner /
 * SCORE-link holder. The footer only appears when both slots are resolved
 * participants; a COMPLETED match can still be re-scored (the current scores
 * pre-fill the inputs so corrections are one edit away). The form is injected
 * via MatchNode's `footer` slot so themed node styling stays intact.
 */
export function ScoreableMatch({ match, canScore, onScore, pending }: ScoreableMatchProps) {
  const t = useTranslations("detail");

  const bothResolved =
    match.opponent1?.participantId != null && match.opponent2?.participantId != null;
  const isCompleted = match.status === "COMPLETED";
  // Only score matches that aren't already decided. Re-scoring is rejected by
  // the API (it would strand already-advanced winners), so we don't offer it.
  const showForm = canScore && bothResolved && !isCompleted;

  const [score1, setScore1] = useState<string>(
    match.opponent1?.score != null ? String(match.opponent1.score) : "",
  );
  const [score2, setScore2] = useState<string>(
    match.opponent2?.score != null ? String(match.opponent2.score) : "",
  );

  // Re-sync inputs if the underlying scores change (e.g. a live update from
  // another device) so a stale prefill can't overwrite newer data.
  useEffect(() => {
    setScore1(match.opponent1?.score != null ? String(match.opponent1.score) : "");
    setScore2(match.opponent2?.score != null ? String(match.opponent2.score) : "");
  }, [match.opponent1?.score, match.opponent2?.score]);

  function submit() {
    if (pending) return;
    onScore(match.id, toScore(score1), toScore(score2));
  }

  const footer = showForm ? (
    <form
      className="flex items-center gap-1.5 rounded-md border border-black/10 bg-black/5 px-2 py-1.5 dark:border-white/10 dark:bg-white/5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Input
        aria-label={t("scoreOpponent1")}
        type="number"
        min={0}
        inputMode="numeric"
        className="w-12 px-1.5 py-1 text-center"
        value={score1}
        disabled={pending}
        onChange={(event) => setScore1(event.target.value)}
      />
      <span className="text-xs text-muted-foreground">:</span>
      <Input
        aria-label={t("scoreOpponent2")}
        type="number"
        min={0}
        inputMode="numeric"
        className="w-12 px-1.5 py-1 text-center"
        value={score2}
        disabled={pending}
        onChange={(event) => setScore2(event.target.value)}
      />
      <Button type="submit" className="ml-auto px-2.5 py-1 text-xs" disabled={pending}>
        {pending ? t("scoreSaving") : t("scoreSave")}
      </Button>
    </form>
  ) : undefined;

  return <MatchNode match={match} footer={footer} />;
}
