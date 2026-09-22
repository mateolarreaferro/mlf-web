import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The class site: its own repo, and the static copy of it that
    // `npm run sync:agents` writes (vendored three.js included).
    "agents2026-mateo/**",
    "public/agents/**",
  ]),
]);

export default eslintConfig;
