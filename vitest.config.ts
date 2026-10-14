import { defineConfig } from "vitest/config";
import { config } from "dotenv";

export default defineConfig({
  test: {
    env: config({ path: ".env.test" }).parsed,
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false,
  },
});