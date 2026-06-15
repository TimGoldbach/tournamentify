"use client";

import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import type { DesignTokens } from "@tournamentify/shared";
import { PRESETS } from "@/components/bracket/design";
import { hexToHslChannels, hslChannelsToHex } from "@/lib/color";
import { useCreateSavedTheme, useDeleteSavedTheme, useSavedThemes } from "@/lib/queries";
import { Button, Card, Input, Label, Select } from "@/components/ui";

/**
 * Bracket theme editor: a preset picker, native color pickers for the node and
 * connector colors (bridged hex <-> "H S% L%" via lib/color so the picker shows
 * the real token value), a radius field, and a Save button.
 *
 * For logged-in users it also exposes a saved-theme library — apply / delete a
 * stored theme, or "Save as…" the current tokens under a name. Guests see a hint
 * prompting them to log in.
 */

const PRESET_NAMES = Object.keys(PRESETS);

export function ThemeEditor({
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
  const { status } = useSession();
  const isLoggedIn = status === "authenticated";

  const savedThemes = useSavedThemes(isLoggedIn);
  const createTheme = useCreateSavedTheme();
  const deleteTheme = useDeleteSavedTheme();

  function applyPreset(presetName: string) {
    const preset = PRESETS[presetName];
    if (!preset) {
      onChange({ ...value, preset: undefined });
      return;
    }
    onChange({ ...preset });
  }

  // Color pickers speak hex; tokens are "H S% L%" channel triplets. Fall back to
  // the classic preset's values so an unset token still gives the picker a swatch.
  const nodeHex = hslChannelsToHex(value.nodeBg ?? PRESETS.classic!.nodeBg!);
  const connectorHex = hslChannelsToHex(value.connector ?? PRESETS.classic!.connector!);

  function onSaveAs() {
    const name = window.prompt(t("themeNamePrompt"));
    if (!name) {
      return;
    }
    createTheme.mutate({ name, tokens: value });
  }

  function onDeleteTheme(themeId: string) {
    if (!window.confirm(t("themeDeleteConfirm"))) {
      return;
    }
    deleteTheme.mutate(themeId);
  }

  return (
    <Card className="mt-4 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="theme-preset">{t("themePreset")}</Label>
          <Select
            id="theme-preset"
            className="w-40"
            value={value.preset ?? ""}
            onChange={(event) => applyPreset(event.target.value)}
          >
            <option value="">{t("themeCustom")}</option>
            {PRESET_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="theme-node-bg">{t("themeColorNode")}</Label>
          <Input
            id="theme-node-bg"
            type="color"
            className="h-10 w-16 p-1"
            value={nodeHex}
            onChange={(event) =>
              onChange({
                ...value,
                nodeBg: hexToHslChannels(event.target.value),
                preset: undefined,
              })
            }
          />
        </div>

        <div>
          <Label htmlFor="theme-connector">{t("themeColorConnector")}</Label>
          <Input
            id="theme-connector"
            type="color"
            className="h-10 w-16 p-1"
            value={connectorHex}
            onChange={(event) =>
              onChange({
                ...value,
                connector: hexToHslChannels(event.target.value),
                preset: undefined,
              })
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
      </div>

      <div className="border-t border-black/10 pt-4 dark:border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{t("themeLibrary")}</h3>
          {isLoggedIn ? (
            <Button variant="ghost" onClick={onSaveAs} disabled={createTheme.isPending}>
              {t("themeSaveAs")}
            </Button>
          ) : null}
        </div>

        {!isLoggedIn ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("themeLoginHint")}</p>
        ) : savedThemes.isLoading ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("loading")}</p>
        ) : !savedThemes.data || savedThemes.data.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("themeNone")}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {savedThemes.data.map((theme) => (
              <li
                key={theme.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-black/10 px-3 py-2 text-sm dark:border-white/10"
              >
                {/* Clicking the name applies the theme's tokens to the live editor. */}
                <button
                  type="button"
                  className="truncate text-left font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:underline"
                  onClick={() => onChange({ ...theme.tokens })}
                >
                  {theme.name}
                </button>
                <Button
                  variant="danger"
                  onClick={() => onDeleteTheme(theme.id)}
                  disabled={deleteTheme.isPending}
                >
                  {t("themeDelete")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export default ThemeEditor;
