"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { CapabilityLinkDto } from "@tournamentify/shared";
import {
  useCapabilityLinks,
  useCreateCapabilityLink,
  useRevokeCapabilityLink,
} from "@/lib/queries";
import { Button, Card, Label, Select } from "@/components/ui";

/** Time-to-live options for a new link. `0` means "never expires". */
const TTL_OPTIONS = [
  { value: 0, labelKey: "expiryNever" },
  { value: 24, labelKey: "expiry24h" },
  { value: 24 * 7, labelKey: "expiry7d" },
] as const;

/**
 * Owner-only sharing panel. Lists the tournament's capability links and lets the
 * owner mint new VIEW (read-only) or SCORE (scoring-enabled) links. Each link is
 * surfaced as a copyable public URL pointing at the live viewer route.
 */

function buildShareUrl(locale: string, id: string, token: string): string {
  // `window` is undefined during SSR; callers guard before invoking this.
  return `${window.location.origin}/${locale}/t/${encodeURIComponent(id)}?token=${encodeURIComponent(
    token,
  )}`;
}

function LinkRow({ id, link }: { id: string; link: CapabilityLinkDto }) {
  const t = useTranslations("share");
  const locale = useLocale();
  const revokeLink = useRevokeCapabilityLink(id);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  async function onCopy() {
    setCopyError(false);
    try {
      // Build the URL on click so `window` is always defined here.
      const url = buildShareUrl(locale, id, link.token);
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError(true);
    }
  }

  function onRevoke() {
    if (!window.confirm(t("revokeConfirm"))) {
      return;
    }
    revokeLink.mutate(link.id);
  }

  const expiry = link.expiresAt
    ? new Date(link.expiresAt).toLocaleString(locale)
    : t("expiryNever");

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-black/10 px-3 py-2 text-sm dark:border-white/10">
      <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
        <span className="rounded-full border border-black/10 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground dark:border-white/15">
          {t(`type.${link.type}`)}
        </span>
        <code className="truncate font-mono text-xs text-muted-foreground">{link.token}</code>
        <span className="text-xs text-muted-foreground">
          {t("expiresLabel")} {expiry}
        </span>
      </span>
      <span className="inline-flex items-center gap-2">
        {copyError ? <span className="text-xs text-red-600">{t("copyError")}</span> : null}
        <Button variant="ghost" onClick={onCopy}>
          {copied ? t("copied") : t("copy")}
        </Button>
        <Button variant="danger" onClick={onRevoke} disabled={revokeLink.isPending}>
          {revokeLink.isPending ? t("revoking") : t("revoke")}
        </Button>
      </span>
    </li>
  );
}

export default function SharePanel({ id }: { id: string }) {
  const t = useTranslations("share");
  const links = useCapabilityLinks(id);
  const createLink = useCreateCapabilityLink(id);

  // TTL in hours for the next link; 0 = never expires (omit expiresInHours).
  const [ttlHours, setTtlHours] = useState(0);

  function create(type: "VIEW" | "SCORE") {
    createLink.mutate({ type, expiresInHours: ttlHours > 0 ? ttlHours : undefined });
  }

  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="link-ttl">{t("expiry")}</Label>
            <Select
              id="link-ttl"
              className="w-36"
              value={ttlHours}
              onChange={(event) => setTtlHours(Number(event.target.value))}
            >
              {TTL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </Select>
          </div>
          <Button variant="ghost" onClick={() => create("VIEW")} disabled={createLink.isPending}>
            {t("createView")}
          </Button>
          <Button onClick={() => create("SCORE")} disabled={createLink.isPending}>
            {t("createScore")}
          </Button>
        </div>
      </div>

      {createLink.isError ? (
        <p className="mt-3 text-sm text-red-600">
          {createLink.error instanceof Error ? createLink.error.message : t("createError")}
        </p>
      ) : null}

      <div className="mt-4">
        {links.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : links.isError ? (
          <p className="text-sm text-red-600">
            {links.error instanceof Error ? links.error.message : t("loadError")}
          </p>
        ) : !links.data || links.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="space-y-2">
            {links.data.map((link) => (
              <LinkRow key={link.id} id={id} link={link} />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
