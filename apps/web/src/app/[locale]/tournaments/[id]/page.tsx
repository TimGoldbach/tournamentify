"use client";

import { useTranslations, useLocale } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import type { MatchDto, MatchSlotDto, StageDto } from "@tournamentify/shared";
import * as api from "@/lib/api";
import { useDeleteTournament, useTournament } from "@/lib/queries";
import { Button, Card } from "@/components/ui";

const stageTypeLabelKey: Record<string, string> = {
  single_elimination: "formatSingleElimination",
  double_elimination: "formatDoubleElimination",
  round_robin: "formatRoundRobin",
  swiss: "formatSwiss",
};

function slotLabel(slot: MatchSlotDto | null, fallback: string): string {
  if (!slot) return fallback;
  return slot.label;
}

function MatchCard({ match }: { match: MatchDto }) {
  const t = useTranslations("detail");
  return (
    <Card className="w-56 p-3">
      <div className="space-y-1 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">{slotLabel(match.opponent1, t("tbd"))}</span>
          <span className="tabular-nums text-muted-foreground">
            {match.opponent1?.score ?? ""}
          </span>
        </div>
        <div className="h-px bg-black/10 dark:bg-white/10" />
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">{slotLabel(match.opponent2, t("tbd"))}</span>
          <span className="tabular-nums text-muted-foreground">
            {match.opponent2?.score ?? ""}
          </span>
        </div>
      </div>
    </Card>
  );
}

function StageView({ stage }: { stage: StageDto }) {
  const t = useTranslations("detail");
  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold">
        {stage.name}
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          {t(stageTypeLabelKey[stage.type] ?? stage.type)}
        </span>
      </h2>

      {stage.groups.map((group) => (
        <div key={group.id} className="mt-4">
          {stage.groups.length > 1 ? (
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">
              {t("group", { number: group.number })}
            </h3>
          ) : null}

          <div className="flex gap-6 overflow-x-auto pb-2">
            {group.rounds.map((round) => (
              <div key={round.id} className="flex flex-col gap-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {round.name}
                </h4>
                {round.matches.map((match) => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function DetailContent() {
  const t = useTranslations("detail");
  const locale = useLocale();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, isLoading, isError, error } = useTournament(id);
  const deleteTournament = useDeleteTournament();
  const [exportError, setExportError] = useState<string | null>(null);

  async function onExport() {
    setExportError(null);
    try {
      const setup = await api.exportSetup(id);
      const blob = new Blob([JSON.stringify(setup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      const safeName = (data?.name ?? "tournament").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
      anchor.download = `${safeName || "tournament"}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : t("exportError"));
    }
  }

  function onDelete() {
    if (!window.confirm(t("deleteConfirm"))) return;
    deleteTournament.mutate(id, {
      onSuccess: () => {
        router.push(`/${locale}/dashboard`);
      },
    });
  }

  if (isLoading) {
    return (
      <main className="mx-auto max-w-5xl p-8">
        <p className="text-muted-foreground">{t("loading")}</p>
      </main>
    );
  }

  if (isError || !data) {
    return (
      <main className="mx-auto max-w-5xl p-8">
        <p className="text-red-600">
          {t("loadError")}
          {error instanceof Error ? `: ${error.message}` : ""}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{data.name}</h1>
          <span className="mt-1 inline-block rounded-full border border-black/10 px-2 py-0.5 text-xs text-muted-foreground dark:border-white/15">
            {t(`status.${data.status}`)}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onExport}>
            {t("export")}
          </Button>
          <Button variant="danger" onClick={onDelete} disabled={deleteTournament.isPending}>
            {deleteTournament.isPending ? t("deleting") : t("delete")}
          </Button>
        </div>
      </div>

      {exportError ? <p className="mt-3 text-sm text-red-600">{exportError}</p> : null}
      {deleteTournament.isError ? (
        <p className="mt-3 text-sm text-red-600">
          {deleteTournament.error instanceof Error
            ? deleteTournament.error.message
            : t("deleteError")}
        </p>
      ) : null}

      <p className="mt-4 rounded-md border border-black/10 bg-black/5 p-3 text-sm text-muted-foreground dark:border-white/10 dark:bg-white/5">
        {t("editorComingSoon")}
      </p>

      {data.stages.map((stage) => (
        <StageView key={stage.id} stage={stage} />
      ))}
    </main>
  );
}

export default function TournamentDetailPage() {
  return <DetailContent />;
}
