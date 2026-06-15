import { describe, expect, it } from "vitest";
import { hexToHslChannels, hslChannelsToHex } from "./color";

/**
 * Round-trip stability is what matters for the color picker: a token loaded into
 * the <input type="color"> and written straight back must not drift. We assert
 * stability (idempotence after the first conversion) rather than bit-exact
 * equality, since hex -> HSL rounds to whole degrees/percents.
 */
describe("color helpers", () => {
  it("converts white to a neutral, near-full-lightness triplet", () => {
    expect(hexToHslChannels("#ffffff")).toBe("0 0% 100%");
    expect(hslChannelsToHex("0 0% 100%")).toBe("#ffffff");
  });

  it("converts black to a zero-lightness triplet", () => {
    expect(hexToHslChannels("#000000")).toBe("0 0% 0%");
    expect(hslChannelsToHex("0 0% 0%")).toBe("#000000");
  });

  it("is stable for a mid hue after the first round-trip", () => {
    const hex = "#4f8fce";
    const channels = hexToHslChannels(hex);
    const back = hslChannelsToHex(channels);
    // hex -> channels -> hex -> channels must be a fixed point.
    expect(hexToHslChannels(back)).toBe(channels);
    expect(hslChannelsToHex(hexToHslChannels(back))).toBe(back);
  });

  it("round-trips a saturated primary stably", () => {
    const channels = hexToHslChannels("#ff0000");
    expect(channels).toBe("0 100% 50%");
    expect(hslChannelsToHex(channels)).toBe("#ff0000");
  });

  it("falls back to defaults on garbage input", () => {
    expect(hexToHslChannels("not-a-color")).toBe("0 0% 0%");
    expect(hslChannelsToHex("nope")).toBe("#000000");
    expect(hexToHslChannels("#zzz")).toBe("0 0% 0%");
  });

  it("accepts shorthand hex", () => {
    expect(hexToHslChannels("#fff")).toBe("0 0% 100%");
    expect(hexToHslChannels("#000")).toBe("0 0% 0%");
  });
});
