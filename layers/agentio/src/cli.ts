import { createRequire } from "node:module";

type Handler = (args: string[]) => Promise<number>;

const require = createRequire(import.meta.url);

function pkgVersion(): string {
  return require("../../../package.json").version as string;
}

const verbs: Record<string, { summary: string; run: Handler }> = {
  version: {
    summary: "Print toolkit version",
    run: async () => {
      console.log(pkgVersion());
      return 0;
    },
  },
};

export async function runCli(argv: string[]): Promise<number> {
  const verb = argv[0];
  if (!verb || verb === "help" || verb === "--help") {
    const lines = Object.entries(verbs).map(([name, v]) => `  ${name.padEnd(16)} ${v.summary}`);
    console.log(`agent-wallet <verb> [options]\n\nVerbs:\n${lines.join("\n")}`);
    return verb ? 0 : 2;
  }
  const entry = verbs[verb];
  if (!entry) {
    console.error(JSON.stringify({ ok: false, error: { code: "UNKNOWN_VERB", message: `Unknown verb: ${verb}`, hint: "Run agent-wallet help" } }));
    return 2;
  }
  return entry.run(argv.slice(1));
}
