import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createRequire } from "node:module";
import { createWallet, getAddresses, importWallet, listWallets } from "../../keys/src/wallet.ts";
import { chainCheck, chainResolve } from "../../chains/src/api.ts";
import { balance, fees, txStatus, utxos } from "../../read/src/api.ts";
import { send } from "../../send/src/api.ts";
import { learnContract } from "../../learn/src/api.ts";
import { call as contractCall, compile as contractCompile, deploy as contractDeploy, write as contractWrite } from "../../contracts/src/api.ts";
import { quote as swapQuote, swap as swapExec } from "../../swap/src/api.ts";
import { bridge as bridgeExec, quote as bridgeQuote, status as bridgeStatus } from "../../bridge/src/api.ts";
import { deriveEvmAddress } from "../../keys/src/derive.ts";
import { unlockMnemonic } from "../../keys/src/wallet.ts";

const require = createRequire(import.meta.url);

/** Passphrase comes from the environment so it never rides in tool arguments (which a model could echo). */
function passphrase(): string {
  const p = process.env["AGENT_WALLET_PASSPHRASE"];
  if (!p) throw new Error("AGENT_WALLET_PASSPHRASE is not set; export it before starting the MCP server");
  return p;
}

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

/** Wrap a layer call so a thrown error still returns a readable envelope-ish payload, never a transport crash. */
function tool<A>(fn: (args: A) => Promise<{ ok: boolean }>) {
  return async (args: A) => {
    try {
      return json(await fn(args));
    } catch (e) {
      return json({ ok: false, error: { code: "TOOL_ERROR", message: String(e instanceof Error ? e.message : e) } });
    }
  };
}

const chainArg = z.string().describe('Chain reference: a name (ethereum, base, sepolia), numeric id (8453), or Bitcoin network (bitcoin, signet, testnet, regtest)');
const addressArg = z.string().describe("An address on the target chain");

export function buildServer(): McpServer {
  const version = (require("../../../package.json") as { version: string }).version;
  const server = new McpServer({ name: "agent-wallet", version });

  server.registerTool(
    "wallet_create",
    {
      description: "Create a new non-custodial wallet: generates a BIP-39 mnemonic and stores it encrypted (keystore v3) on this machine. Returns the mnemonic ONCE (back it up) plus the first EVM and Bitcoin addresses. Use when the user has no wallet yet. Does NOT touch any network.",
      inputSchema: { name: z.string().default("main").describe("Local wallet name (lowercase, digits, hyphens)"), words: z.enum(["12", "24"]).default("12").describe("Mnemonic length") },
    },
    tool(async (a: { name: string; words: "12" | "24" }) => createWallet({ name: a.name, passphrase: passphrase(), words: a.words === "24" ? 24 : 12 })),
  );

  server.registerTool(
    "wallet_import",
    {
      description: "Import an existing wallet from a BIP-39 mnemonic and store it encrypted locally. Use when the user already has a seed phrase. The mnemonic is a tool argument here, so prefer wallet_create for fresh wallets.",
      inputSchema: { name: z.string().default("main"), mnemonic: z.string().describe("BIP-39 english mnemonic (12 or 24 words)") },
    },
    tool(async (a: { name: string; mnemonic: string }) => importWallet({ name: a.name, passphrase: passphrase(), mnemonic: a.mnemonic })),
  );

  server.registerTool(
    "wallet_list",
    { description: "List the wallets in the local keystore (names and creation times). No secrets are returned.", inputSchema: {} },
    tool(async () => listWallets()),
  );

  server.registerTool(
    "wallet_addresses",
    {
      description: "Derive receive addresses for a wallet. EVM addresses are one series; Bitcoin uses taproot (p2tr) or native segwit (p2wpkh). Use to get an address to receive funds.",
      inputSchema: {
        name: z.string().default("main"),
        family: z.enum(["evm", "btc"]).default("evm"),
        network: z.enum(["bitcoin", "signet", "testnet", "regtest"]).optional().describe("Bitcoin network (btc family only)"),
        addressType: z.enum(["p2tr", "p2wpkh"]).optional(),
        start: z.number().int().min(0).default(0),
        count: z.number().int().min(1).max(100).default(1),
      },
    },
    tool(async (a: any) => getAddresses({ name: a.name, passphrase: passphrase(), family: a.family, ...(a.network && { network: a.network }), ...(a.addressType && { addressType: a.addressType }), start: a.start, count: a.count })),
  );

  server.registerTool(
    "chain_resolve",
    { description: "Resolve a chain reference to its RPC endpoints, explorer, native currency and testnet flag. Use to confirm a chain is known before operating on it.", inputSchema: { chain: chainArg } },
    tool(async (a: { chain: string }) => chainResolve(a.chain)),
  );

  server.registerTool(
    "chain_check",
    { description: "Probe a chain's live endpoints: for EVM confirms the RPC reports the expected chain id; for Bitcoin returns the tip height. Use to verify connectivity.", inputSchema: { chain: chainArg, rpc: z.string().optional().describe("Override RPC URL") } },
    tool(async (a: any) => chainCheck(a.chain, a.rpc)),
  );

  server.registerTool(
    "balance",
    {
      description: "Get the balance of an address: native coin, or an ERC-20 if a token address is given (EVM), or BTC (with confirmed/mempool split). Amounts are returned in both base units and a formatted string.",
      inputSchema: { chain: chainArg, address: addressArg, token: z.string().optional().describe("ERC-20 token address (EVM only)"), rpc: z.string().optional() },
    },
    tool(async (a: any) => balance({ chain: a.chain, address: a.address, ...(a.token && { token: a.token }), ...(a.rpc && { rpc: a.rpc }) })),
  );

  server.registerTool(
    "utxos",
    { description: "List unspent outputs for a Bitcoin address (bitcoin/signet/testnet/regtest only).", inputSchema: { chain: z.enum(["bitcoin", "signet", "testnet", "regtest"]), address: addressArg } },
    tool(async (a: { chain: string; address: string }) => utxos({ chain: a.chain, address: a.address })),
  );

  server.registerTool(
    "fees",
    { description: "Current fee estimates: EVM EIP-1559 fees in wei, or Bitcoin sat/vB targets.", inputSchema: { chain: chainArg, rpc: z.string().optional() } },
    tool(async (a: any) => fees({ chain: a.chain, ...(a.rpc && { rpc: a.rpc }) })),
  );

  server.registerTool(
    "tx_status",
    { description: "Look up a transaction by hash (EVM) or txid (Bitcoin). Returns confirmed/pending/reverted/not_found; not_found is a normal answer, not an error.", inputSchema: { chain: chainArg, ref: z.string().describe("Transaction hash or Bitcoin txid"), rpc: z.string().optional() } },
    tool(async (a: any) => txStatus({ chain: a.chain, ref: a.ref, ...(a.rpc && { rpc: a.rpc }) })),
  );

  server.registerTool(
    "send",
    {
      description: "Send funds end to end: native coin, an ERC-20 (with token), or BTC. Passes the safety gate (mainnet is denied unless enabled in config), signs offline, and broadcasts directly. amount is in display units (ETH/BTC/token); use amountRaw for base units or 'all' to sweep BTC. Set wait to confirm an EVM tx before returning.",
      inputSchema: {
        chain: chainArg,
        to: addressArg,
        amount: z.string().optional().describe("Amount in display units, e.g. 0.5"),
        amountRaw: z.string().optional().describe("Amount in base units (wei/sats), or 'all' to sweep BTC"),
        token: z.string().optional().describe("ERC-20 token address for a token transfer (EVM)"),
        wallet: z.string().default("main"),
        wait: z.boolean().default(false),
        rpc: z.string().optional(),
      },
    },
    tool(async (a: any) =>
      send({ chain: a.chain, to: a.to, wallet: a.wallet, passphrase: passphrase(), wait: a.wait, ...(a.amount && { amount: a.amount }), ...(a.amountRaw && { amountRaw: a.amountRaw }), ...(a.token && { token: a.token }), ...(a.rpc && { rpc: a.rpc }) }),
    ),
  );

  server.registerTool(
    "contract_learn",
    {
      description: "Fetch what a deployed contract is: its ABI, verified source, compiler and proxy target. Keyless-first (Sourcify, Blockscout), then WhatsABI guesses an ABI from bytecode for unverified contracts. Use before calling an unknown contract.",
      inputSchema: { chain: chainArg, address: addressArg, verifiedOnly: z.boolean().default(false).describe("Fail instead of guessing from bytecode"), rpc: z.string().optional() },
    },
    tool(async (a: any) => learnContract({ chain: a.chain, address: a.address, verifiedOnly: a.verifiedOnly, ...(a.rpc && { rpc: a.rpc }) })),
  );

  server.registerTool(
    "contract_compile",
    { description: "Compile Solidity source with solc-js. Returns ABI and bytecode for each deployable contract. Use to check a contract compiles before deploying.", inputSchema: { source: z.string().describe("Solidity source code"), sourceName: z.string().default("Contract.sol"), contractName: z.string().optional() } },
    tool(async (a: any) => contractCompile(a.source, a.sourceName, a.contractName)),
  );

  server.registerTool(
    "contract_deploy",
    {
      description: "Compile and deploy a Solidity contract in one step (or deploy given abi+bytecode). Gated and signed locally, broadcast directly, waits for the address. Returns the deployed address and the ABI ready to call.",
      inputSchema: {
        chain: chainArg,
        source: z.string().optional().describe("Solidity source; compiled here"),
        contractName: z.string().optional(),
        abi: z.array(z.unknown()).optional(),
        bytecode: z.string().optional(),
        constructorArgs: z.array(z.unknown()).default([]),
        wallet: z.string().default("main"),
        rpc: z.string().optional(),
      },
    },
    tool(async (a: any) => contractDeploy({ chain: a.chain, wallet: a.wallet, passphrase: passphrase(), constructorArgs: a.constructorArgs, ...(a.source && { source: a.source }), ...(a.contractName && { contractName: a.contractName }), ...(a.abi && { abi: a.abi }), ...(a.bytecode && { bytecode: a.bytecode }), ...(a.rpc && { rpc: a.rpc }) })),
  );

  server.registerTool(
    "contract_call",
    { description: "Call a read-only (view/pure) contract function. No transaction, no gas. Provide the ABI (from contract_learn or contract_deploy).", inputSchema: { chain: chainArg, address: addressArg, abi: z.array(z.unknown()), function: z.string(), args: z.array(z.unknown()).default([]), rpc: z.string().optional() } },
    tool(async (a: any) => contractCall({ chain: a.chain, address: a.address, abi: a.abi, function: a.function, args: a.args, ...(a.rpc && { rpc: a.rpc }) })),
  );

  server.registerTool(
    "contract_write",
    {
      description: "Call a state-changing contract function: gated, signed locally, broadcast. Rejects view/pure functions (use contract_call). Provide the ABI. Set wait to confirm before returning.",
      inputSchema: { chain: chainArg, address: addressArg, abi: z.array(z.unknown()), function: z.string(), args: z.array(z.unknown()).default([]), valueWei: z.string().optional().describe("Native value to send with the call, in wei"), wallet: z.string().default("main"), wait: z.boolean().default(false), rpc: z.string().optional() },
    },
    tool(async (a: any) => contractWrite({ chain: a.chain, address: a.address, abi: a.abi, function: a.function, args: a.args, wallet: a.wallet, passphrase: passphrase(), wait: a.wait, ...(a.valueWei && { valueWei: a.valueWei }), ...(a.rpc && { rpc: a.rpc }) })),
  );

  server.registerTool(
    "swap_quote",
    {
      description: "Quote a token swap across DEX aggregators (CoW, Kyber, Uniswap) and return the best. Read-only. Amounts in base units. Use before swap to preview the rate.",
      inputSchema: { chain: chainArg, sellToken: z.string(), buyToken: z.string(), sellAmount: z.string().describe("Sell amount in base units"), from: addressArg, adapter: z.enum(["cow", "kyber", "uniswap"]).optional(), slippageBps: z.number().int().min(1).max(5000).optional().describe("Slippage in basis points (default 50)") },
    },
    tool(async (a: any) => swapQuote({ chain: a.chain, sellToken: a.sellToken, buyToken: a.buyToken, sellAmount: a.sellAmount, from: a.from, ...(a.adapter && { adapter: a.adapter }), ...(a.slippageBps && { slippageBps: a.slippageBps }) })),
  );

  server.registerTool(
    "swap",
    {
      description: "Execute a token swap: quote the best route, approve the spender if needed, then sign and broadcast (Kyber) or sign and post an intent order (CoW). Gated: mainnet swaps require enabling mainnet in config. The 'from' address is derived from the wallet.",
      inputSchema: { chain: chainArg, sellToken: z.string(), buyToken: z.string(), sellAmount: z.string(), wallet: z.string().default("main"), adapter: z.enum(["cow", "kyber", "uniswap"]).optional(), slippageBps: z.number().int().min(1).max(5000).optional(), wait: z.boolean().default(false), rpc: z.string().optional() },
    },
    tool(async (a: any) => {
      const from = deriveEvmAddress(await unlockMnemonic(a.wallet, passphrase()), 0).address;
      return swapExec({ chain: a.chain, sellToken: a.sellToken, buyToken: a.buyToken, sellAmount: a.sellAmount, from, wallet: a.wallet, passphrase: passphrase(), wait: a.wait, ...(a.adapter && { adapter: a.adapter }), ...(a.slippageBps && { slippageBps: a.slippageBps }), ...(a.rpc && { rpc: a.rpc }) });
    }),
  );

  server.registerTool(
    "bridge_quote",
    { description: "Quote a cross-chain transfer via LI.FI. Read-only. Amounts in base units. Use before bridge to preview the route and minimum received.", inputSchema: { fromChain: chainArg, toChain: chainArg, fromToken: z.string(), toToken: z.string(), fromAmount: z.string(), fromAddress: addressArg, toAddress: z.string().optional(), slippage: z.number().min(0).max(1).optional() } },
    tool(async (a: any) => bridgeQuote({ fromChain: a.fromChain, toChain: a.toChain, fromToken: a.fromToken, toToken: a.toToken, fromAmount: a.fromAmount, fromAddress: a.fromAddress, ...(a.toAddress && { toAddress: a.toAddress }), ...(a.slippage !== undefined && { slippage: a.slippage }) })),
  );

  server.registerTool(
    "bridge",
    {
      description: "Execute a cross-chain transfer via LI.FI: quote, approve if needed, sign and broadcast the source-chain tx. Gated (mainnet requires opt-in). Delivery on the destination is asynchronous; track it with bridge_status. The source address is derived from the wallet.",
      inputSchema: { fromChain: chainArg, toChain: chainArg, fromToken: z.string(), toToken: z.string(), fromAmount: z.string(), wallet: z.string().default("main"), toAddress: z.string().optional(), slippage: z.number().min(0).max(1).optional(), wait: z.boolean().default(false), rpc: z.string().optional() },
    },
    tool(async (a: any) => {
      const from = deriveEvmAddress(await unlockMnemonic(a.wallet, passphrase()), 0).address;
      return bridgeExec({ fromChain: a.fromChain, toChain: a.toChain, fromToken: a.fromToken, toToken: a.toToken, fromAmount: a.fromAmount, fromAddress: from, wallet: a.wallet, passphrase: passphrase(), wait: a.wait, ...(a.toAddress && { toAddress: a.toAddress }), ...(a.slippage !== undefined && { slippage: a.slippage }), ...(a.rpc && { rpc: a.rpc }) });
    }),
  );

  server.registerTool(
    "bridge_status",
    { description: "Check the delivery status of a cross-chain transfer by its source transaction hash. PENDING until the destination fills, DONE on delivery.", inputSchema: { txHash: z.string(), fromChain: chainArg.optional(), toChain: chainArg.optional(), tool: z.string().optional().describe("Bridge tool name from the quote") } },
    tool(async (a: any) => bridgeStatus({ txHash: a.txHash, ...(a.fromChain && { fromChain: a.fromChain }), ...(a.toChain && { toChain: a.toChain }), ...(a.tool && { tool: a.tool }) })),
  );

  return server;
}

export async function runMcp(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
