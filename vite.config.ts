import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: { ignorePatterns: ["dist/**", "coverage/**"] },
  lint: {
    ignorePatterns: ["dist/**", "coverage/**"],
    options: { typeAware: true, typeCheck: true },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "terminal-vendor",
              test: /node_modules[\\/](?:@wterm|just-bash)[\\/]/,
              priority: 50,
            },
            {
              name: "react-vendor",
              test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
              priority: 40,
            },
            {
              name: "table-vendor",
              test: /node_modules[\\/]@tanstack[\\/]/,
              priority: 30,
            },
            {
              name: "plot-vendor",
              test: /node_modules[\\/]uplot[\\/]/,
              priority: 30,
            },
            {
              name: "state-vendor",
              test: /node_modules[\\/](?:dexie|zustand)[\\/]/,
              priority: 20,
            },
            {
              name: "workspace-vendor",
              test: /node_modules[\\/]react-rnd[\\/]/,
              priority: 20,
            },
          ],
        },
      },
    },
  },
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
    fileParallelism: false,
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/domain/**/*.ts", "src/store/**/*.ts"],
      reporter: ["text", "html"],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
