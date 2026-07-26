/**
 * Bundle entry. Kept separate from the thin PATH launcher so esbuild does not
 * pull the shell wrapper into the graph.
 */
import { loadDotenv } from "../layers/core/src/dotenv.ts";
import { runCli } from "../layers/agentio/src/cli.ts";

loadDotenv();

runCli(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    console.error(
      JSON.stringify({
        ok: false,
        error: { code: "CLI_CRASH", message: String(err?.message ?? err) },
      }),
    );
    process.exit(1);
  },
);
