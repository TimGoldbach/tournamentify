/**
 * Color conversion helpers bridging the two representations the app uses:
 *
 *  - HSL channel triplets ("210 40% 98%") — the form CSS variables expect, so
 *    they can be dropped straight into hsl(var(--…)). This is how design tokens
 *    (nodeBg / connector) are stored.
 *  - Hex strings ("#rrggbb") — what native <input type="color"> reads and writes.
 *
 * Both functions are tolerant of malformed input and fall back to a sensible
 * default rather than throwing, so the UI never crashes on a stray token.
 */

const DEFAULT_HEX = "#000000";
const DEFAULT_CHANNELS = "0 0% 0%";

/** Clamp a number into [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Expand "#abc" -> "aabbcc" and strip a leading "#"; returns null if unusable. */
function normalizeHex(hex: string): string | null {
  if (typeof hex !== "string") {
    return null;
  }
  let value = hex.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(value)) {
    value = value
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (/^[0-9a-fA-F]{6}$/.test(value)) {
    return value.toLowerCase();
  }
  return null;
}

/**
 * Convert a hex color to the "H S% L%" channel form CSS variables expect.
 * Hue is rounded to a whole degree; saturation/lightness to whole percents.
 * Returns "0 0% 0%" for input that cannot be parsed.
 */
export function hexToHslChannels(hex: string): string {
  const normalized = normalizeHex(hex);
  if (!normalized) {
    return DEFAULT_CHANNELS;
  }

  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  const l = (max + min) / 2;

  let h = 0;
  let s = 0;
  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case r:
        h = (g - b) / delta + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / delta + 2;
        break;
      default:
        h = (r - g) / delta + 4;
        break;
    }
    h *= 60;
  }

  const hh = Math.round(h) % 360;
  const ss = Math.round(s * 100);
  const ll = Math.round(l * 100);
  return `${hh < 0 ? hh + 360 : hh} ${ss}% ${ll}%`;
}

/** Format a 0..255 channel as a two-digit lowercase hex pair. */
function toHexPair(value: number): string {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
}

/**
 * Convert a "H S% L%" channel triplet to "#rrggbb".
 * Returns "#000000" for input that cannot be parsed.
 */
export function hslChannelsToHex(channels: string): string {
  if (typeof channels !== "string") {
    return DEFAULT_HEX;
  }
  const match = channels
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)%?\s+(-?\d+(?:\.\d+)?)%?$/);
  if (!match) {
    return DEFAULT_HEX;
  }

  const h = ((Number(match[1]) % 360) + 360) % 360;
  const s = clamp(Number(match[2]), 0, 100) / 100;
  const l = clamp(Number(match[3]), 0, 100) / 100;

  if (s === 0) {
    const gray = toHexPair(l * 255);
    return `#${gray}${gray}${gray}`;
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  const hueToChannel = (t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const hk = h / 360;
  const r = hueToChannel(hk + 1 / 3) * 255;
  const g = hueToChannel(hk) * 255;
  const b = hueToChannel(hk - 1 / 3) * 255;

  return `#${toHexPair(r)}${toHexPair(g)}${toHexPair(b)}`;
}
