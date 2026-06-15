"use client";

import { useTranslations, useLocale } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { DesignTokens, MatchDto } from "@tournamentify/shared";
import * as api from "@/lib/api";
import { useDeleteTournament, useScoreMatch, useTournament, useUpdateDesign } from "@/lib/queries";
import { useTournamentEvents } from "@/lib/useTournamentEvents";
import { ScoreableMatch } from "@/components/ScoreableMatch";
import { RoundRobinMatches } from "@/components/RoundRobinMatches";
import SharePanel from "@/components/SharePanel";
import { StageView } from "@/components/bracket/StageView";
import { designToStyle, PRESETS } from "@/components/bracket/design";
import { Button, Card, Input, Label } from "@/components/ui";

const PRESET_NAMES = Object.keys(PRESETS);

/** Owner theme controls: preset picker + the three overridable tokens. */
function ThemeBar({
  value,
  onChange,
  onSave,
  saving,
}: {
  value: DesignTokens;
  onChange: (next: DesignTokens) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const t = useTranslations("detail");

  function applyPreset(presetName: string) {
    const preset = PRESETS[presetName];
    if (!preset) {
      onChange({ ...value, preset: undefined });
      return;
    }
    onChange({ ...preset });
  }

  return (
    <Card className="mt-4 flex flex-wrap items-end gap-3">
      <div>
        <Label htmlFor="theme-preset">{t("themePreset")}</Label>
        <select
          id="theme-preset"
          className="w-full rounded-md border border-black/15 bg-background px-3 py-2 text-sm text-foreground dark:border-white/20"
          value={value.preset ?? ""}
          onChange={(event) => applyPreset(event.target.value)}
        >
          <option value="">{t("themeCustom")}</option>
          {PRESET_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="theme-node-bg">{t("themeNodeBg")}</Label>
        <Input
          id="theme-node-bg"
          className="w-32"
          value={value.nodeBg ?? ""}
          placeholder="#ffffff"
          onChange={(event) =>
            onChange({ ...value, nodeBg: event.target.value || undefined, preset: undefined })
          }
        />
      </div>

      <div>
        <Label htmlFor="theme-connector">{t("themeConnector")}</Label>
        <Input
          id="theme-connector"
          className="w-32"
          value={value.connector ?? ""}
          placeholder="#cccccc"
          onChange={(event) =>
            onChange({ ...value, connector: event.target.value || undefined, preset: undefined })
          }
        />
      </div>

      <div>
        <Label htmlFor="theme-radius">{t("themeRadius")}</Label>
        <Input
          id="theme-radius"
          className="w-24"
          value={value.radius ?? ""}
          placeholder="8px"
          onChange={(event) =>
            onChange({ ...value, radius: event.target.value || undefined, preset: undefined })
          }
        />
      </div>

      <Button className="ml-auto" onClick={onSave} disabled={saving}>
        {saving ? t("themeSaving") : t("themeSave")}
      </Button>
    </Card>
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
  const scoreMutation = useScoreMatch(id);
  const updateDesign = useUpdateDesign(id);

  const [exportError, setExportError] = useState<string | null>(null);
  const [localDesign, setLocalDesign] = useState<DesignTokens>({});

  // Live refresh: owner relies on the BFF session cookie (no token needed).
  useTournamentEvents(id, undefined, true);

  // Keep the live-preview design in sync with the persisted tokens.
  useEffect(() => {
    if (data?.design) {
      setLocalDesign(data.design);
    }
  }, [data?.design]);

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

  const renderMatch = (match: MatchDto) => (
    <ScoreableMatch
      match={match}
      canScore={data.viewerCanScore}
      pending={scoreMutation.isPending}
      onScore={(matchId, opponent1Score, opponent2Score) =>
        scoreMutation.mutate({ matchId, input: { opponent1Score, opponent2Score } })
      }
    />
  );

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
      {scoreMutation.isError ? (
        <p className="mt-3 text-sm text-red-600">
          {scoreMutation.error instanceof Error ? scoreMutation.error.message : t("scoreError")}
        </p>
      ) : null}

      <ThemeBar
        value={localDesign}
        onChange={setLocalDesign}
        onSave={() => updateDesign.mutate(localDesign)}
        saving={updateDesign.isPending}
      />
      {updateDesign.isError ? (
        <p className="mt-2 text-sm text-red-600">
          {updateDesign.error instanceof Error ? updateDesign.error.message : t("themeError")}
        </p>
      ) : null}

      <SharePanel id={id} />

      <div style={designToStyle(localDesign)}>
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

export default function TournamentDetailPage() {
  return <DetailContent />;
}
