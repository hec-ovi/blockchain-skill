import { createRequire } from "node:module";
import { createWallet, getAddresses, importWallet, listWallets } from "../../keys/src/wallet.ts";
import { chainCheck, chainResolve } from "../../chains/src/api.ts";
import { balance, fees, txStatus, utxos } from "../../read/src/api.ts";
import { send } from "../../send/src/api.ts";
import { learnContract } from "../../learn/src/api.ts";
import { call as contractCall, compile as contractCompile, deploy as contractDeploy, write as contractWrite } from "../../contracts/src/api.ts";
import { quote as swapQuote, swap as swapExec } from "../../swap/src/api.ts";
import { bridge as bridgeExec, quote as bridgeQuote, status as bridgeStatus } from "../../bridge/src/api.ts";
import { faucet as faucetFund } from "../../faucet/src/api.ts";
import { readFileSync } from "node:fs";

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
  "chain-resolve": {
    summary: "Resolve a chain ref (name, id, bitcoin/signet/testnet) to endpoints",
    run: async (args) => {
      const { rest } = parseFlags(args);
      return emit(await chainResolve(rest[0] ?? "ethereum"));
    },
  },
  "chain-check": {
    summary: "Probe a chain's RPC/Esplora endpoints (--rpc <url> to override)",
    run: async (args) => {
      const { flags, rest } = parseFlags(args);
      return emit(await chainCheck(rest[0] ?? "ethereum", flags["rpc"]));
    },
  },
  balance: {
    summary: "balance <chain> <address> [--token 0x..] [--rpc url]",
    run: async (args) => {
      const { flags, rest } = parseFlags(args);
      return emit(
        await balance({
          chain: rest[0] ?? "ethereum",
          ...(rest[1] !== undefined && { address: rest[1] }),
          ...(flags["token"] !== undefined && { token: flags["token"] }),
          ...(flags["rpc"] !== undefined && { rpc: flags["rpc"] }),
        }),
      );
    },
  },
  utxos: {
    summary: "utxos <btc-network> <address>",
    run: async (args) => {
      const { rest } = parseFlags(args);
      return emit(await utxos({ chain: rest[0] ?? "bitcoin", ...(rest[1] !== undefined && { address: rest[1] }) }));
    },
  },
  fees: {
    summary: "fees <chain> [--rpc url]",
    run: async (args) => {
      const { flags, rest } = parseFlags(args);
      return emit(await fees({ chain: rest[0] ?? "ethereum", ...(flags["rpc"] !== undefined && { rpc: flags["rpc"] }) }));
    },
  },
  send: {
    summary: "send <chain> --to <addr> --amount <display-units> [--amount-raw base|all] [--token 0x..] [--wallet name] [--fee-rate satvb] [--rpc url] [--wait]",
    run: async (args) => {
      const { flags, rest } = parseFlags(args);
      return emit(
        await send({
          wallet: flags["wallet"] ?? "main",
          passphrase: passphraseFrom(flags),
          chain: rest[0] ?? "",
          to: flags["to"] ?? "",
          ...(flags["amount"] !== undefined && { amount: flags["amount"] }),
          ...(flags["amount-raw"] !== undefined && { amountRaw: flags["amount-raw"] as never }),
          ...(flags["token"] !== undefined && { token: flags["token"] }),
          ...(flags["index"] !== undefined && { index: Number(flags["index"]) }),
          ...(flags["type"] !== undefined && { addressType: flags["type"] as never }),
          ...(flags["fee-rate"] !== undefined && { feeRateSatVb: Number(flags["fee-rate"]) }),
          ...(flags["rpc"] !== undefined && { rpc: flags["rpc"] }),
          ...(flags["wait"] !== undefined && { wait: true }),
        }),
      );
    },
  },
  tx: {
    summary: "tx <chain> <hash-or-txid> [--rpc url]",
    run: async (args) => {
      const { flags, rest } = parseFlags(args);
      return emit(
        await txStatus({
          chain: rest[0] ?? "ethereum",
          ...(rest[1] !== undefined && { ref: rest[1] }),
          ...(flags["rpc"] !== undefined && { rpc: flags["rpc"] }),
        }),
      );
    },
  },
  "contract-learn": {
    summary: "contract-learn <chain> <address> [--rpc url] [--verified-only]",
    run: async (args) => {
      const { flags, rest } = parseFlags(args);
      return emit(
        await learnContract({
          chain: rest[0] ?? "ethereum",
          address: rest[1] ?? "",
          ...(flags["rpc"] !== undefined && { rpc: flags["rpc"] }),
          ...(flags["verified-only"] !== undefined && { verifiedOnly: true }),
        }),
      );
    },
  },
  "contract-compile": {
    summary: "contract-compile --source <file.sol> [--name Contract]",
    run: async (args) => {
      const { flags } = parseFlags(args);
      const source = flags["source"] ? readFileSync(flags["source"], "utf8") : "";
      return emit(await contractCompile(source, flags["source"]?.split("/").pop() ?? "Contract.sol", flags["name"]));
    },
  },
  "contract-deploy": {
    summary: "contract-deploy <chain> --source <file.sol> [--name C] [--args a,b] [--wallet name] [--rpc url]",
    run: async (args) => {
      const { flags, rest } = parseFlags(args);
      const source = flags["source"] ? readFileSync(flags["source"], "utf8") : undefined;
      const ctorArgs = flags["args"] ? flags["args"].split(",").map((s) => s.trim()) : [];
      return emit(
        await contractDeploy({
          wallet: flags["wallet"] ?? "main",
          passphrase: passphraseFrom(flags),
          chain: rest[0] ?? "",
          ...(source !== undefined && { source }),
          ...(flags["name"] !== undefined && { contractName: flags["name"] }),
          constructorArgs: ctorArgs,
          ...(flags["rpc"] !== undefined && { rpc: flags["rpc"] }),
        }),
      );
    },
  },
  "contract-call": {
    summary: "contract-call <chain> <address> --fn name [--args a,b] --abi <file.json> [--rpc url]",
    run: async (args) => {
      const { flags, rest } = parseFlags(args);
      const abi = flags["abi"] ? JSON.parse(readFileSync(flags["abi"], "utf8")) : [];
      return emit(
        await contractCall({
          chain: rest[0] ?? "ethereum",
          address: rest[1] ?? "",
          abi,
          function: flags["fn"] ?? "",
          ...(flags["args"] !== undefined && { args: flags["args"].split(",").map((s) => s.trim()) }),
          ...(flags["rpc"] !== undefined && { rpc: flags["rpc"] }),
        }),
      );
    },
  },
  "contract-write": {
    summary: "contract-write <chain> <address> --fn name [--args a,b] --abi <file.json> [--wallet name] [--rpc url] [--wait]",
    run: async (args) => {
      const { flags, rest } = parseFlags(args);
      const abi = flags["abi"] ? JSON.parse(readFileSync(flags["abi"], "utf8")) : [];
      return emit(
        await contractWrite({
          wallet: flags["wallet"] ?? "main",
          passphrase: passphraseFrom(flags),
          chain: rest[0] ?? "",
          address: rest[1] ?? "",
          abi,
          function: flags["fn"] ?? "",
          ...(flags["args"] !== undefined && { args: flags["args"].split(",").map((s) => s.trim()) }),
          ...(flags["value"] !== undefined && { valueWei: flags["value"] }),
          ...(flags["rpc"] !== undefined && { rpc: flags["rpc"] }),
          ...(flags["wait"] !== undefined && { wait: true }),
        }),
      );
    },
  },
  "swap-quote": {
    summary: "swap-quote <chain> --sell 0x.. --buy 0x.. --amount <base-units> --from 0x.. [--adapter cow|kyber|uniswap] [--slippage bps]",
    run: async (args) => {
      const { flags, rest } = parseFlags(args);
      return emit(
        await swapQuote({
          chain: rest[0] ?? "ethereum",
          sellToken: flags["sell"] ?? "",
          buyToken: flags["buy"] ?? "",
          sellAmount: flags["amount"] ?? "0",
          from: flags["from"] ?? "",
          ...(flags["adapter"] !== undefined && { adapter: flags["adapter"] }),
          ...(flags["slippage"] !== undefined && { slippageBps: Number(flags["slippage"]) }),
          ...(flags["rpc"] !== undefined && { rpc: flags["rpc"] }),
        }),
      );
    },
  },
  swap: {
    summary: "swap <chain> --sell 0x.. --buy 0x.. --amount <base-units> [--adapter] [--slippage bps] [--wallet name] [--rpc url] [--wait]",
    run: async (args) => {
      const { flags, rest } = parseFlags(args);
      const index = flags["index"] !== undefined ? Number(flags["index"]) : 0;
      const { deriveEvmAddress } = await import("../../keys/src/derive.ts");
      const { unlockMnemonic } = await import("../../keys/src/wallet.ts");
      const wallet = flags["wallet"] ?? "main";
      const passphrase = passphraseFrom(flags);
      // derive `from` from the wallet unless overridden
      let from = flags["from"] ?? "";
      if (!from) {
        try {
          from = deriveEvmAddress(await unlockMnemonic(wallet, passphrase), index).address;
        } catch {
          from = "";
        }
      }
      return emit(
        await swapExec({
          chain: rest[0] ?? "",
          sellToken: flags["sell"] ?? "",
          buyToken: flags["buy"] ?? "",
          sellAmount: flags["amount"] ?? "0",
          from,
          wallet,
          passphrase,
          index,
          ...(flags["adapter"] !== undefined && { adapter: flags["adapter"] }),
          ...(flags["slippage"] !== undefined && { slippageBps: Number(flags["slippage"]) }),
          ...(flags["rpc"] !== undefined && { rpc: flags["rpc"] }),
          ...(flags["wait"] !== undefined && { wait: true }),
        }),
      );
    },
  },
  "bridge-quote": {
    summary: "bridge-quote --from-chain <c> --to-chain <c> --from-token 0x.. --to-token 0x.. --amount <base> --address 0x..",
    run: async (args) => {
      const { flags } = parseFlags(args);
      return emit(
        await bridgeQuote({
          fromChain: flags["from-chain"] ?? "",
          toChain: flags["to-chain"] ?? "",
          fromToken: flags["from-token"] ?? "",
          toToken: flags["to-token"] ?? "",
          fromAmount: flags["amount"] ?? "0",
          fromAddress: flags["address"] ?? "",
          ...(flags["to-address"] !== undefined && { toAddress: flags["to-address"] }),
          ...(flags["slippage"] !== undefined && { slippage: Number(flags["slippage"]) }),
        }),
      );
    },
  },
  bridge: {
    summary: "bridge --from-chain <c> --to-chain <c> --from-token 0x.. --to-token 0x.. --amount <base> [--wallet name] [--rpc url] [--wait]",
    run: async (args) => {
      const { flags } = parseFlags(args);
      const index = flags["index"] !== undefined ? Number(flags["index"]) : 0;
      const wallet = flags["wallet"] ?? "main";
      const passphrase = passphraseFrom(flags);
      let from = flags["address"] ?? "";
      if (!from) {
        const { deriveEvmAddress } = await import("../../keys/src/derive.ts");
        const { unlockMnemonic } = await import("../../keys/src/wallet.ts");
        try {
          from = deriveEvmAddress(await unlockMnemonic(wallet, passphrase), index).address;
        } catch {
          from = "";
        }
      }
      return emit(
        await bridgeExec({
          fromChain: flags["from-chain"] ?? "",
          toChain: flags["to-chain"] ?? "",
          fromToken: flags["from-token"] ?? "",
          toToken: flags["to-token"] ?? "",
          fromAmount: flags["amount"] ?? "0",
          fromAddress: from,
          wallet,
          passphrase,
          index,
          ...(flags["to-address"] !== undefined && { toAddress: flags["to-address"] }),
          ...(flags["slippage"] !== undefined && { slippage: Number(flags["slippage"]) }),
          ...(flags["rpc"] !== undefined && { rpc: flags["rpc"] }),
          ...(flags["wait"] !== undefined && { wait: true }),
        }),
      );
    },
  },
  "bridge-status": {
    summary: "bridge-status <sourceTxHash> [--from-chain c] [--to-chain c] [--tool name]",
    run: async (args) => {
      const { flags, rest } = parseFlags(args);
      return emit(
        await bridgeStatus({
          txHash: rest[0] ?? "",
          ...(flags["from-chain"] !== undefined && { fromChain: flags["from-chain"] }),
          ...(flags["to-chain"] !== undefined && { toChain: flags["to-chain"] }),
          ...(flags["tool"] !== undefined && { tool: flags["tool"] }),
        }),
      );
    },
  },
  faucet: {
    summary: "faucet --network base-sepolia|sepolia [--token eth|usdc] [--address 0x.. | --wallet name] (loads free testnet credits, needs a free CDP key)",
    run: async (args) => {
      const { flags } = parseFlags(args);
      let address = flags["address"] ?? "";
      if (!address) {
        const { deriveEvmAddress } = await import("../../keys/src/derive.ts");
        const { unlockMnemonic } = await import("../../keys/src/wallet.ts");
        try {
          address = deriveEvmAddress(await unlockMnemonic(flags["wallet"] ?? "main", passphraseFrom(flags)), 0).address;
        } catch {
          address = "";
        }
      }
      return emit(
        await faucetFund({
          address,
          network: flags["network"] ?? "base-sepolia",
          ...(flags["token"] !== undefined && { token: flags["token"] as never }),
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
