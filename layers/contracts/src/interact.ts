import { decodeFunctionResult, encodeFunctionData, getAbiItem, isAddress } from "viem";
import { CodedError } from "../../core/src/envelope.ts";
import { resolveChain, type FetchLike } from "../../chains/src/registry.ts";
import { evmClient } from "../../chains/src/evm.ts";
import { decide } from "../../gate/src/policy.ts";
import { evmAccount } from "../../keys/src/derive.ts";
import { unlockMnemonic } from "../../keys/src/wallet.ts";
import { signEvmTx } from "../../sign/src/evm.ts";

export interface CallRequest {
  chain: string;
  address: string;
  abi: unknown[];
  function: string;
  args?: unknown[];
  rpc?: string;
  fetchFn?: FetchLike;
}

export interface WriteRequest extends CallRequest {
  wallet: string;
  passphrase: string;
  index?: number;
  valueWei?: string;
  wait?: boolean;
  timeoutMs?: number;
}

/** JSON-safe: bigints to decimal strings, recursively. */
function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonSafe(v)]));
  }
  return value;
}

function coerceArgs(args: unknown[]): unknown[] {
  return args.map((a) => (typeof a === "string" && /^\d+$/.test(a) && a.length > 15 ? BigInt(a) : a));
}

function assertContract(address: string): `0x${string}` {
  if (!isAddress(address, { strict: false })) throw new CodedError("ADDRESS_INVALID", `"${address}" is not a valid address`);
  return address as `0x${string}`;
}

function findFn(abi: unknown[], name: string): any {
  const item = getAbiItem({ abi: abi as any, name });
  if (!item || (item as any).type !== "function") {
    const fns = (abi as any[]).filter((i) => i.type === "function").map((i) => i.name);
    throw new CodedError("FUNCTION_NOT_FOUND", `no function "${name}" in the ABI`, `Available: ${fns.slice(0, 20).join(", ") || "none"}`);
  }
  return item;
}

/** Read-only eth_call against a view/pure (or any) function. */
export async function callContract(req: CallRequest): Promise<{ function: string; result: unknown }> {
  const info = await resolveChain(req.chain, req.fetchFn);
  if (info.family !== "evm") throw new CodedError("FAMILY_MISMATCH", "contract calls are EVM-only");
  const address = assertContract(req.address);
  findFn(req.abi, req.function);
  const data = encodeFunctionData({ abi: req.abi as any, functionName: req.function, args: coerceArgs(req.args ?? []) as any });
  const client = evmClient(info, req.rpc);
  const { data: ret } = await client.call({ to: address, data }).catch((e) => {
    throw new CodedError("CALL_REVERTED", String(e?.shortMessage ?? e?.message ?? e).slice(0, 300), "The call reverted; check args and that the function exists on-chain");
  });
  const decoded = decodeFunctionResult({ abi: req.abi as any, functionName: req.function, data: ret ?? "0x" });
  return { function: req.function, result: jsonSafe(decoded) };
}

/** State-changing call: gate, sign, broadcast. */
export async function writeContract(req: WriteRequest): Promise<{ function: string; hash: string; from: string; status: string; blockNumber?: string; gasUsed?: string }> {
  const info = await resolveChain(req.chain, req.fetchFn);
  if (info.family !== "evm") throw new CodedError("FAMILY_MISMATCH", "contract writes are EVM-only");
  const address = assertContract(req.address);
  const fn = findFn(req.abi, req.function);
  if (fn.stateMutability === "view" || fn.stateMutability === "pure") {
    throw new CodedError("NOT_WRITABLE", `${req.function} is ${fn.stateMutability}; use call, not write`, "Read-only functions do not need a transaction");
  }
  const value = req.valueWei !== undefined ? BigInt(req.valueWei) : 0n;
  decide({
    kind: "contract-write",
    chain: { family: "evm", name: info.name, testnet: info.testnet, chainId: info.chainId },
    valueBaseUnits: value.toString(),
  });

  const data = encodeFunctionData({ abi: req.abi as any, functionName: req.function, args: coerceArgs(req.args ?? []) as any });
  const client = evmClient(info, req.rpc);
  const from = evmAccount(await unlockMnemonic(req.wallet, req.passphrase), req.index ?? 0).address;
  const [nonce, fees] = await Promise.all([client.getTransactionCount({ address: from, blockTag: "pending" }), client.estimateFeesPerGas()]);
  const gas = await client.estimateGas({ account: from, to: address, data, value }).catch((e) => {
    throw new CodedError("GAS_ESTIMATE_FAILED", String(e?.shortMessage ?? e?.message ?? e).slice(0, 300), "The transaction would revert; check args and permissions");
  });

  const signed = await signEvmTx({
    wallet: req.wallet,
    passphrase: req.passphrase,
    index: req.index ?? 0,
    chainId: info.chainId,
    to: address,
    valueWei: value.toString(),
    data,
    nonce,
    gasLimit: ((gas * 120n) / 100n).toString(),
    maxFeePerGas: fees.maxFeePerGas.toString(),
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
  });
  const hash = (await client.request({ method: "eth_sendRawTransaction", params: [signed.rawTx as `0x${string}`] })) as `0x${string}`;
  if (!req.wait) return { function: req.function, hash, from, status: "broadcast" };
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: req.timeoutMs ?? 120000 }).catch(() => null);
  if (!receipt) throw new CodedError("CONFIRM_TIMEOUT", `tx ${hash} not confirmed in time`, `Check with: agent-wallet tx ${req.chain} ${hash}`);
  return {
    function: req.function,
    hash,
    from,
    status: receipt.status === "success" ? "confirmed" : "reverted",
    blockNumber: receipt.blockNumber.toString(),
    gasUsed: receipt.gasUsed.toString(),
  };
}
