import { describe, expect, it } from "vitest";
import { SETUP_SCHEMA_VERSION, tournamentSetupSchema } from "./tournament";

describe("tournamentSetupSchema", () => {
  it("round-trips a valid setup (no results)", () => {
    const setup = {
      schemaVersion: SETUP_SCHEMA_VERSION,
      name: "Friday Cup",
      stages: [{ type: "single_elimination", name: "Main", settings: {} }],
      participants: [{ name: "Alice", seed: 1 }, { name: "Bob", seed: 2 }],
    };

    const parsed = tournamentSetupSchema.parse(setup);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(setup);
  });

  it("rejects an unknown stage type", () => {
    const result = tournamentSetupSchema.safeParse({
      schemaVersion: SETUP_SCHEMA_VERSION,
      name: "Bad",
      stages: [{ type: "battle_royale", name: "x", settings: {} }],
      participants: [],
    });
    expect(result.success).toBe(false);
  });
});
