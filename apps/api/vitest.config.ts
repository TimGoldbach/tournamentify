import { defineConfig } from "vitest/config";

export default defineConfig({
  // Nest decorators (@Injectable) are transformed by esbuild; no metadata is
  // needed for the dependency-free engine code under test.
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
      },
    },
  },
  test: {
    include: ["src/**/*.{test,spec}.ts"],
    environment: "node",
  },
});
