import { erc20Abi, formatUnits, isAddress, isHash } from "viem";
import { CodedError } from "../../core/src/envelope.ts";
import { evmClient } from "../../chains/src/evm.ts";
import type { EvmChainInfo } from "../../chains/src/registry.ts";

export function assertAddress(value: string): `0x${string}` {
  if (!isAddress(value, { strict: false })) {
    throw new CodedError("ADDRESS_INVALID", `"${value}" is not a valid EVM address`, "Expect 0x followed by 40 hex characters");
  }
  return value as `0x${string}`;
}

export interface EvmBalance {
  family: "evm";
  address: string;
  wei: string;
  formatted: string;
  symbol: string;
}

export async function evmBalance(info: EvmChainInfo, address: string, rpc?: string): Promise<EvmBalance> {
  const wei = await evmClient(info, rpc).getBalance({ address: assertAddress(address) });
  return {
    family: "evm",
    address,
    wei: wei.toString(),
    formatted: formatUnits(wei, info.nativeCurrency.decimals),
    symbol: info.nativeCurrency.symbol,
  };
}

export interface EvmTokenBalance {
  family: "evm";
  token: string;
  holder: string;
  raw: string;
  formatted: string;
  symbol: string;
  decimals: number;
}

export async function evmTokenBalance(info: EvmChainInfo, token: string, holder: string, rpc?: string): Promise<EvmTokenBalance> {
  const client = evmClient(info, rpc);
  const tokenAddr = assertAddress(token);
  const [raw, decimals, symbol] = await Promise.all([
    client.readContract({ address: tokenAddr, abi: erc20Abi, functionName: "balanceOf", args: [assertAddress(holder)] }),
    client.readContract({ address: tokenAddr, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address: tokenAddr, abi: erc20Abi, functionName: "symbol" }),
  ]).catch((e) => {
    throw new CodedError("TOKEN_READ_FAILED", String(e instanceof Error ? e.message : e).slice(0, 300), "Is this address really an ERC-20 on this chain?");
  });
  return {
    family: "evm",
    token,
    holder,
    raw: (raw as bigint).toString(),
    formatted: formatUnits(raw as bigint, decimals as number),
    symbol: symbol as string,
    decimals: decimals as number,
  };
}

export interface EvmFees {
  family: "evm";
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  baseFeePerGas?: string;
}

export async function evmFees(info: EvmChainInfo, rpc?: string): Promise<EvmFees> {
  const client = evmClient(info, rpc);
  const [fees, block] = await Promise.all([client.estimateFeesPerGas(), client.getBlock()]);
  return {
    family: "evm",
    maxFeePerGas: fees.maxFeePerGas.toString(),
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
    ...(block.baseFeePerGas !== null && { baseFeePerGas: block.baseFeePerGas.toString() }),
  };
}

export interface EvmTxInfo {
  family: "evm";
  hash: string;
  status: "confirmed" | "reverted" | "pending" | "not_found";
  blockNumber?: string;
  from?: string;
  to?: string | null;
  valueWei?: string;
  gasUsed?: string;
}

export async function evmTx(info: EvmChainInfo, hash: string, rpc?: string): Promise<EvmTxInfo> {
  if (!isHash(hash)) {
    throw new CodedError("HASH_INVALID", `"${hash}" is not a transaction hash`, "Expect 0x followed by 64 hex characters");
  }
  const client = evmClient(info, rpc);
  const tx = await client.getTransaction({ hash }).catch(() => null);
  if (!tx) return { family: "evm", hash, status: "not_found" };
  const receipt = await client.getTransactionReceipt({ hash }).catch(() => null);
  if (!receipt) {
    return { family: "evm", hash, status: "pending", from: tx.from, to: tx.to, valueWei: tx.value.toString() };
  }
  return {
    family: "evm",
    hash,
    status: receipt.status === "success" ? "confirmed" : "reverted",
    blockNumber: receipt.blockNumber.toString(),
    from: tx.from,
    to: tx.to,
    valueWei: tx.value.toString(),
    gasUsed: receipt.gasUsed.toString(),
  };
}
