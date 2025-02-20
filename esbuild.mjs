#!/usr/bin/env -S node --enable-source-maps --no-warnings=ExperimentalWarning

import { parseArgs } from "node:util";

import { build } from "esbuild";

import pkg from "./package.json" with { type: "json" };

const { positionals } = parseArgs({ allowPositionals: true });

const target = `node${pkg.nodeVersion.replace(/[^\d.]/g, "").split(".")[0]}`;

for (const entryPoint of positionals) {
  await build({
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    loader: { ".hbs": "text" },
    sourcemap: "linked",
    logLevel: "info",
    entryPoints: [`src/${entryPoint}.ts`],
    outfile: `pkg/${entryPoint}.mjs`,
    target,
  });
}
