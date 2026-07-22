#!/usr/bin/env node
import { runCli } from "../layers/agentio/src/cli.ts";

runCli(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    console.error(JSON.stringify({ ok: false, error: { code: "CLI_CRASH", message: String(err?.message ?? err) } }));
    process.exit(1);
  },
);
