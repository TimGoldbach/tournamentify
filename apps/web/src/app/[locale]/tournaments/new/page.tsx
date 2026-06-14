"use client";

import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { CreateTournamentInput, StageType } from "@tournamentify/shared";
import { useCreateTournament } from "@/lib/queries";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";

const stageTypeOptions: Array<{ value: StageType; labelKey: string }> = [
  { value: "single_elimination", labelKey: "formatSingleElimination" },
  { value: "double_elimination", labelKey: "formatDoubleElimination" },
  { value: "round_robin", labelKey: "formatRoundRobin" },
  { value: "swiss", labelKey: "formatSwiss" },
];

function CreateContent() {
  const t = useTranslations("create");
  const locale = useLocale();
  const router = useRouter();
  const createTournament = useCreateTournament();

  const [name, setName] = useState("");
  const [format, setFormat] = useState<StageType>("single_elimination");
  const [participantsText, setParticipantsText] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const participants = participantsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((participantName, i) => ({ name: participantName, seed: i + 1 }));

    const input: CreateTournamentInput = {
      name: name.trim(),
      stages: [{ type: format, name: "Hauptrunde", settings: {} }],
      participants,
    };

    createTournament.mutate(input, {
      onSuccess: (created) => {
        router.push(`/${locale}/tournaments/${created.id}`);
      },
    });
  }

  const error = createTournament.error;

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>

      <Card className="mt-6">
        <form className="space-y-5" onSubmit={onSubmit}>
          <div>
            <Label htmlFor="name">{t("nameLabel")}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              required
            />
          </div>

          <div>
            <Label htmlFor="format">{t("formatLabel")}</Label>
            <Select
              id="format"
              value={format}
              onChange={(e) => setFormat(e.target.value as StageType)}
            >
              {stageTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">{t("formatHelp")}</p>
          </div>

          <div>
            <Label htmlFor="participants">{t("participantsLabel")}</Label>
            <Textarea
              id="participants"
              value={participantsText}
              onChange={(e) => setParticipantsText(e.target.value)}
              placeholder={t("participantsPlaceholder")}
            />
            <p className="mt-1 text-xs text-muted-foreground">{t("participantsHelp")}</p>
          </div>

          {error ? (
            <p className="text-sm text-red-600">
              {error instanceof Error ? error.message : t("submitError")}
            </p>
          ) : null}

          <Button type="submit" variant="primary" disabled={createTournament.isPending}>
            {createTournament.isPending ? t("submitting") : t("submit")}
          </Button>
        </form>
      </Card>
    </main>
  );
}

export default function CreateTournamentPage() {
  return <CreateContent />;
}
