import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/bot.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "dist/index.mjs",
  target: "node20",
  // Only mark true native Node packages as external, bundle workspace packages
  external: [
    "pg-native",
    "sharp",
    "grammy",
    "groq-sdk",
    "drizzle-orm",
    "pg",
  ],
  sourcemap: true,
  resolveExtensions: [".ts", ".js", ".mjs", ".cjs"],
  banner: {
    js: `
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
`,
  },
});

console.log("Build complete");
