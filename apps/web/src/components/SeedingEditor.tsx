"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { ParticipantDto } from "@tournamentify/shared";
import { useReseed } from "@/lib/queries";
import { Button, Card } from "@/components/ui";

/**
 * Dependency-free seeding editor. Participants are reordered with per-row Up/Down
 * buttons (no drag-and-drop), then the new order is persisted via PUT /seeding,
 * which regenerates the bracket. Reseeding is only allowed while the tournament
 * is still a DRAFT; once results exist the editor is locked and read-only.
 */

/** Move the item at `index` by `delta` (±1), returning a new array. */
function move<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) {
    return items;
  }
  const next = items.slice();
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item!);
  return next;
}

export function SeedingEditor({
  id,
  participants,
  locked,
}: {
  id: string;
  participants: ParticipantDto[];
  locked: boolean;
}) {
  const t = useTranslations("detail");
  const reseed = useReseed(id);

  const [order, setOrder] = useState<ParticipantDto[]>(participants);

  // Keep local order in sync when the upstream participant list changes (e.g.
  // after a successful reseed re-renders the parent with fresh data).
  useEffect(() => {
    setOrder(participants);
  }, [participants]);

  function onSave() {
    reseed.mutate(order.map((p) => p.id));
  }

  return (
    <Card className="mt-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{t("seedingTitle")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("seedingHint")}</p>
      </div>

      {locked ? <p className="text-sm text-muted-foreground">{t("seedingLocked")}</p> : null}

      <ol className="space-y-2">
        {order.map((participant, index) => (
          <li
            key={participant.id}
            className="flex items-center justify-between gap-2 rounded-md border border-black/10 px-3 py-2 text-sm dark:border-white/10"
          >
            <span className="inline-flex items-center gap-2">
              <span className="w-6 text-right tabular-nums text-muted-foreground">{index + 1}.</span>
              <span className="font-medium">{participant.name}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Button
                variant="ghost"
                aria-label={t("seedingUp")}
                disabled={locked || index === 0 || reseed.isPending}
                onClick={() => setOrder((current) => move(current, index, -1))}
              >
                {t("seedingUp")}
              </Button>
              <Button
                variant="ghost"
                aria-label={t("seedingDown")}
                disabled={locked || index === order.length - 1 || reseed.isPending}
                onClick={() => setOrder((current) => move(current, index, 1))}
              >
                {t("seedingDown")}
              </Button>
            </span>
          </li>
        ))}
      </ol>

      {reseed.isError ? (
        <p className="text-sm text-red-600">
          {reseed.error instanceof Error ? reseed.error.message : t("seedingError")}
        </p>
      ) : null}

      <Button onClick={onSave} disabled={locked || reseed.isPending}>
        {reseed.isPending ? t("seedingSaving") : t("seedingSave")}
      </Button>
    </Card>
  );
}

export default SeedingEditor;
