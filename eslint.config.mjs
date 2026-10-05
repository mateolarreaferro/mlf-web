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
    ".vercel/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The class site: its own repo, and the static copy of it that
    // `npm run sync:agents` writes (vendored three.js included).
    "agents2026-mateo/**",
    "public/agents/**",
    // Hosted projects: their own repos, and the built copies that
    // `npm run sync:demos` writes.
    "hosted/**",
    "public/theo/**",
    "public/headwave/**",
    "public/sticky-notes/**",
    // the Periphery browser extension: plain scripts against chrome.* globals
    "extensions/**",
    // Mateo's p5.js sketches, kept exactly as he wrote them (p5 globals)
    "public/sketches/**",
  ]),
]);

export default eslintConfig;
