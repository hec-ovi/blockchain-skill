import { encodeFunctionData, parseUnits } from "viem";
import { CodedError } from "../../core/src/envelope.ts";
import { resolveChain, type FetchLike } from "../../chains/src/registry.ts";
import { evmClient } from "../../chains/src/evm.ts";
import { decide } from "../../gate/src/policy.ts";
import { evmAccount } from "../../keys/src/derive.ts";
import { unlockMnemonic } from "../../keys/src/wallet.ts";
import { signEvmTx } from "../../sign/src/evm.ts";

/** Canonical WETH (or wrapped native) used for wrap/unwrap and CoW-style sells. */
export const WETH_BY_CHAIN: Record<number, `0x${string}`> = {
  1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  11155111: "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9",
  8453: "0x4200000000000000000000000000000000000006",
  42161: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  10: "0x4200000000000000000000000000000000000006",
  137: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
};

const WETH_ABI = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "wad", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export function wethAddress(chainId: number): `0x${string}` {
  const w = WETH_BY_CHAIN[chainId];
  if (!w) {
    throw new CodedError(
      "WRAP_UNSUPPORTED_CHAIN",
      `no WETH mapping for chain ${chainId}`,
      "Pass --weth 0x.. or use a chain with a known wrapped native token",
    );
  }
  return w;
}

export function isNativeToken(addr: string): boolean {
  const a = addr.toLowerCase();
  return a === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" || a === "0x0000000000000000000000000000000000000000";
}

export interface WrapRequest {
  wallet: string;
  passphrase: string;
  chain: string;
  /** display ETH units, or amountRaw wei */
  amount?: string;
  amountRaw?: string;
  index?: number;
  rpc?: string;
  wait?: boolean;
  weth?: string;
  fetchFn?: FetchLike;
}

export interface WrapResult {
  kind: "wrap" | "unwrap";
  chainId: number;
  weth: string;
  from: string;
  amountWei: string;
  hash: string;
  status: "broadcast" | "confirmed" | "reverted";
  explorer?: string;
}

async function broadcast(
  info: Awaited<ReturnType<typeof resolveChain>> & { family: "evm" },
  wallet: string,
  passphrase: string,
  index: number,
  to: string,
  data: string,
  valueWei: bigint,
  rpc?: string,
  wait?: boolean,
): Promise<{ hash: string; status: "broadcast" | "confirmed" | "reverted" }> {
  const client = evmClient(info, rpc);
  const from = evmAccount(await unlockMnemonic(wallet, passphrase), index).address;
  const [nonce, fees] = await Promise.all([
    client.getTransactionCount({ address: from, blockTag: "pending" }),
    client.estimateFeesPerGas(),
  ]);
  const gas = await client
    .estimateGas({ account: from, to: to as `0x${string}`, data: data as `0x${string}`, value: valueWei })
    .catch((e) => {
      throw new CodedError(
        "WRAP_FAILED",
        String(e?.shortMessage ?? e?.message ?? e).slice(0, 300),
        "Check balance and that the WETH address is correct for this chain",
      );
    });
  const signed = await signEvmTx({
    wallet,
    passphrase,
    index,
    chainId: info.chainId,
    to,
    valueWei: valueWei.toString(),
    data,
    nonce,
    gasLimit: ((gas * 120n) / 100n).toString(),
    maxFeePerGas: fees.maxFeePerGas.toString(),
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
  });
  const hash = (await client.request({
    method: "eth_sendRawTransaction",
    params: [signed.rawTx as `0x${string}`],
  })) as string;
  if (!wait) return { hash, status: "broadcast" };
  const receipt = await client.waitForTransactionReceipt({ hash: hash as `0x${string}`, timeout: 120000 });
  return { hash, status: receipt.status === "success" ? "confirmed" : "reverted" };
}

function parseAmountWei(req: WrapRequest, decimals: number): bigint {
  if (req.amountRaw !== undefined) {
    const v = BigInt(req.amountRaw);
    if (v <= 0n) throw new CodedError("AMOUNT_INVALID", "amount must be positive");
    return v;
  }
  const v = parseUnits(req.amount ?? "0", decimals);
  if (v <= 0n) throw new CodedError("AMOUNT_INVALID", "amount must be positive");
  return v;
}

/** Native ETH/ gas token → WETH (deposit). */
export async function wrapNative(req: WrapRequest): Promise<WrapResult> {
  const info = await resolveChain(req.chain, req.fetchFn);
  if (info.family !== "evm") throw new CodedError("FAMILY_MISMATCH", "wrap is EVM-only");
  const amountWei = parseAmountWei(req, info.nativeCurrency.decimals);
  decide({
    kind: "swap",
    chain: { family: "evm", name: info.name, testnet: info.testnet, chainId: info.chainId },
    valueBaseUnits: amountWei.toString(),
  });
  const weth = (req.weth as `0x${string}` | undefined) ?? wethAddress(info.chainId);
  const data = encodeFunctionData({ abi: WETH_ABI, functionName: "deposit" });
  const index = req.index ?? 0;
  const from = evmAccount(await unlockMnemonic(req.wallet, req.passphrase), index).address;
  const { hash, status } = await broadcast(info, req.wallet, req.passphrase, index, weth, data, amountWei, req.rpc, req.wait);
  return {
    kind: "wrap",
    chainId: info.chainId,
    weth,
    from,
    amountWei: amountWei.toString(),
    hash,
    status,
    ...(info.explorers[0] && { explorer: `${info.explorers[0]}/tx/${hash}` }),
  };
}

/** WETH → native (withdraw). */
export async function unwrapNative(req: WrapRequest): Promise<WrapResult> {
  const info = await resolveChain(req.chain, req.fetchFn);
  if (info.family !== "evm") throw new CodedError("FAMILY_MISMATCH", "unwrap is EVM-only");
  const amountWei = parseAmountWei(req, info.nativeCurrency.decimals);
  decide({
    kind: "swap",
    chain: { family: "evm", name: info.name, testnet: info.testnet, chainId: info.chainId },
    valueBaseUnits: amountWei.toString(),
  });
  const weth = (req.weth as `0x${string}` | undefined) ?? wethAddress(info.chainId);
  const data = encodeFunctionData({ abi: WETH_ABI, functionName: "withdraw", args: [amountWei] });
  const index = req.index ?? 0;
  const from = evmAccount(await unlockMnemonic(req.wallet, req.passphrase), index).address;
  const { hash, status } = await broadcast(info, req.wallet, req.passphrase, index, weth, data, 0n, req.rpc, req.wait);
  return {
    kind: "unwrap",
    chainId: info.chainId,
    weth,
    from,
    amountWei: amountWei.toString(),
    hash,
    status,
    ...(info.explorers[0] && { explorer: `${info.explorers[0]}/tx/${hash}` }),
  };
}
