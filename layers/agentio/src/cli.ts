import { createRequire } from "node:module";
import { createWallet, getAddresses, importWallet, listWallets } from "../../keys/src/wallet.ts";

type Handler = (args: string[]) => Promise<number>;

const require = createRequire(import.meta.url);

function pkgVersion(): string {
  return require("../../../package.json").version as string;
}

/** --key value and --flag pairs to an object; bare args collect in _ . */
export function parseFlags(args: string[]): { flags: Record<string, string>; rest: string[] } {
  const flags: Record<string, string> = {};
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    } else {
      rest.push(a);
    }
  }
  return { flags, rest };
}

function passphraseFrom(flags: Record<string, string>): string {
  const pass = flags["passphrase"] ?? process.env["AGENT_WALLET_PASSPHRASE"];
  if (!pass || pass === "true") {
    console.error(
      JSON.stringify({
        ok: false,
        error: {
          code: "PASSPHRASE_MISSING",
          message: "no passphrase provided",
          hint: "Set AGENT_WALLET_PASSPHRASE or pass --passphrase <value>",
        },
      }),
    );
    process.exit(2);
  }
  return pass;
}

function emit(envelope: { ok: boolean }): number {
  console.log(JSON.stringify(envelope, null, 2));
  return envelope.ok ? 0 : 1;
}

const verbs: Record<string, { summary: string; run: Handler }> = {
  version: {
    summary: "Print toolkit version",
    run: async () => {
      console.log(pkgVersion());
      return 0;
    },
  },
  "wallet-create": {
    summary: "Create a wallet (new BIP-39 mnemonic, encrypted keystore)",
    run: async (args) => {
      const { flags } = parseFlags(args);
      const words = flags["words"] === "24" ? 24 : 12;
      return emit(await createWallet({ name: flags["name"] ?? "main", passphrase: passphraseFrom(flags), words }));
    },
  },
  "wallet-import": {
    summary: "Import a wallet from an existing mnemonic",
    run: async (args) => {
      const { flags } = parseFlags(args);
      return emit(
        await importWallet({
          name: flags["name"] ?? "main",
          passphrase: passphraseFrom(flags),
          mnemonic: flags["mnemonic"] ?? "",
        }),
      );
    },
  },
  "wallet-list": {
    summary: "List wallets in the local keystore",
    run: async () => emit(await listWallets()),
  },
  "wallet-addresses": {
    summary: "Derive receive addresses (--family evm|btc, --network, --type p2tr|p2wpkh, --start, --count)",
    run: async (args) => {
      const { flags } = parseFlags(args);
      return emit(
        await getAddresses({
          name: flags["name"] ?? "main",
          passphrase: passphraseFrom(flags),
          family: flags["family"] === "btc" ? "btc" : "evm",
          ...(flags["network"] !== undefined && { network: flags["network"] as never }),
          ...(flags["type"] !== undefined && { addressType: flags["type"] as never }),
          ...(flags["start"] !== undefined && { start: Number(flags["start"]) }),
          ...(flags["count"] !== undefined && { count: Number(flags["count"]) }),
        }),
      );
    },
  },
};

export async function runCli(argv: string[]): Promise<number> {
  const verb = argv[0];
  if (!verb || verb === "help" || verb === "--help") {
    const lines = Object.entries(verbs).map(([name, v]) => `  ${name.padEnd(18)} ${v.summary}`);
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
