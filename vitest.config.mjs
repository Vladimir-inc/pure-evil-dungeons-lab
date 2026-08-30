import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const installedFoundry = process.env.PURE_EVIL_FOUNDRY_APP;
// Set PURE_EVIL_FOUNDRY_APP to an installed Foundry app root to run against its real @common.
const commonRoot = installedFoundry
  ? path.resolve(installedFoundry, "common")
  : fileURLToPath(new URL("./test/foundry-common", import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@common": commonRoot },
  },
  server: {
    fs: { strict: false, allow: [".", commonRoot, ...(installedFoundry ? [installedFoundry] : [])] },
  },
  test: {
    environment: "node",
  },
});
