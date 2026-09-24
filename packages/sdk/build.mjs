// Bundles the SDK into one dependency-free file and drops it into the
// checkout app's public folder, so the checkout origin serves its own SDK
// (the same way js.stripe.com serves Stripe.js).
import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";

const watch = process.argv.includes("--watch");
mkdirSync("../../apps/checkout/public/sdk", { recursive: true });

const options = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "iife",
  target: "es2019",
  minify: !watch,
  sourcemap: true,
  outfile: "../../apps/checkout/public/sdk/v1.js",
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
