import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// The interception test runs against Foundry's REAL dice classes rather than a lookalike, which
// is the only way to catch "the method I patched is not the one that produces the result".
// Foundry's client sources use an @common alias and live outside the project, so both have to be
// opened up here. Absent (CI, another machine) -> that one test file skips itself.
const FOUNDRY_APP =
  process.env.FOUNDRY_APP ?? "C:/Program Files/Foundry Virtual Tabletop/resources/app";
const hasFoundry = existsSync(`${FOUNDRY_APP}/client/dice/roll.mjs`);

export default defineConfig({
  resolve: {
    alias: hasFoundry ? { "@common": `${FOUNDRY_APP}/common` } : {},
  },
  server: {
    fs: { strict: false, allow: [".", FOUNDRY_APP] },
  },
  test: {
    environment: "node",
    provide: { foundryApp: hasFoundry ? FOUNDRY_APP : null },
  },
});
