#!/usr/bin/env node
import { runCli } from "./cli.js";

// Quit quietly when the reader goes away, e.g. `carejobs market | head`.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

runCli(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`carejobs: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  },
);
