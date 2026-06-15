import type { CSSProperties } from "react";
import type { DesignTokens } from "@tournamentify/shared";

/**
 * Maps token-based bracket themes onto CSS custom properties. The bracket
 * components read --bracket-node-bg / --bracket-connector / --bracket-radius
 * (see globals.css), so a theme restyles the bracket without any raw CSS.
 *
 * Token values are passed through verbatim — they are expected to be HSL
 * channel triplets ("0 0% 100%") for colors and a length ("0.5rem") for the
 * radius, matching the defaults declared in globals.css. Unset tokens are
 * omitted so the surrounding cascade keeps its defaults.
 */

/** CSS custom properties the bracket components consume. */
interface BracketCssProperties extends CSSProperties {
  "--bracket-node-bg"?: string;
  "--bracket-connector"?: string;
  "--bracket-radius"?: string;
}

export function designToStyle(design: DesignTokens | null): CSSProperties {
  if (!design) {
    return {};
  }

  const resolved = design.preset ? { ...PRESETS[design.preset], ...design } : design;
  const style: BracketCssProperties = {};

  if (resolved.nodeBg !== undefined) {
    style["--bracket-node-bg"] = resolved.nodeBg;
  }
  if (resolved.connector !== undefined) {
    style["--bracket-connector"] = resolved.connector;
  }
  if (resolved.radius !== undefined) {
    style["--bracket-radius"] = resolved.radius;
  }

  return style;
}

/**
 * Named starting points a user can pick before overriding individual tokens.
 * Colors are HSL channel triplets so they slot straight into hsl(var(--…)).
 */
export const PRESETS: Record<string, DesignTokens> = {
  classic: {
    preset: "classic",
    nodeBg: "0 0% 100%",
    connector: "215 16% 70%",
    radius: "0.5rem",
  },
  dark: {
    preset: "dark",
    nodeBg: "222 47% 16%",
    connector: "215 20% 45%",
    radius: "0.5rem",
  },
  mint: {
    preset: "mint",
    nodeBg: "160 60% 96%",
    connector: "160 40% 65%",
    radius: "0.75rem",
  },
};
