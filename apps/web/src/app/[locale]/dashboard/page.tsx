"use client";

import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { TournamentSummaryDto } from "@tournamentify/shared";
import * as api from "@/lib/api";
import { useTournaments } from "@/lib/queries";
import { Button, Card } from "@/components/ui";

const stageTypeLabelKey: Record<string, string> = {
  single_elimination: "formatSingleElimination",
  double_elimination: "formatDoubleElimination",
  round_robin: "formatRoundRobin",
  swiss: "formatSwiss",
};

function TournamentCard({
  tournament,
  locale,
}: {
  tournament: TournamentSummaryDto;
  locale: string;
}) {
  const t = useTranslations("dashboard");
  const formats = tournament.stageTypes
    .map((type) => t(stageTypeLabelKey[type] ?? type))
    .join(", ");
  const updated = new Date(tournament.updatedAt).toLocaleString(locale);

  return (
    <Link href={`/${locale}/tournaments/${tournament.id}`} className="block">
      <Card className="h-full transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-semibold">{tournament.name}</h2>
          <span className="shrink-0 rounded-full border border-black/10 px-2 py-0.5 text-xs text-muted-foreground dark:border-white/15">
            {t(`status.${tournament.status}`)}
          </span>
        </div>
        <dl className="mt-3 space-y-1 text-sm text-muted-foreground">
          <div className="flex justify-between gap-2">
            <dt>{t("participants")}</dt>
            <dd>{tournament.participantCount}</dd>
          </div>
          {formats ? (
            <div className="flex justify-between gap-2">
              <dt>{t("format")}</dt>
              <dd className="text-right">{formats}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-2">
            <dt>{t("updated")}</dt>
            <dd className="text-right">{updated}</dd>
          </div>
        </dl>
      </Card>
    </Link>
  );
}

function DashboardContent() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const { data, isLoading, isError, error } = useTournaments();

  // Best-effort: after login, claim any tournaments created while a guest.
  // Fire once per mount; failures are intentionally swallowed.
  const claimed = useRef(false);
  useEffect(() => {
    if (claimed.current) return;
    claimed.current = true;
    api.claim().catch(() => {});
  }, []);

  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Link href={`/${locale}/tournaments/new`}>
          <Button variant="primary">{t("create")}</Button>
        </Link>
      </div>

      {isLoading ? <p className="mt-8 text-muted-foreground">{t("loading")}</p> : null}

      {isError ? (
        <p className="mt-8 text-red-600">
          {t("loadError")}
          {error instanceof Error ? `: ${error.message}` : ""}
        </p>
      ) : null}

      {!isLoading && !isError && data && data.length === 0 ? (
        <Card className="mt-8 text-center">
          <p className="text-muted-foreground">{t("emptyTitle")}</p>
          <div className="mt-4 flex justify-center">
            <Link href={`/${locale}/tournaments/new`}>
              <Button variant="primary">{t("emptyCta")}</Button>
            </Link>
          </div>
        </Card>
      ) : null}

      {!isLoading && !isError && data && data.length > 0 ? (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((tournament) => (
            <TournamentCard key={tournament.id} tournament={tournament} locale={locale} />
          ))}
        </div>
      ) : null}
    </main>
  );
}

export default function DashboardPage() {
  return <DashboardContent />;
}
