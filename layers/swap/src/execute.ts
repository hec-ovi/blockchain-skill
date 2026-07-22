import { encodeFunctionData, erc20Abi } from "viem";
import { CodedError } from "../../core/src/envelope.ts";
import { evmClient } from "../../chains/src/evm.ts";
import { decide } from "../../gate/src/policy.ts";
import { evmAccount } from "../../keys/src/derive.ts";
import { unlockMnemonic } from "../../keys/src/wallet.ts";
import { signEvmTx } from "../../sign/src/evm.ts";
import { GPV2_SETTLEMENT, COW_ORDER_TYPES } from "./adapters/cow.ts";
import type { SwapQuote } from "./port.ts";
import type { EvmChainInfo, FetchLike } from "../../chains/src/registry.ts";

export interface ExecuteContext {
  wallet: string;
  passphrase: string;
  index: number;
  info: EvmChainInfo;
  rpc?: string;
  fetchFn?: FetchLike;
}

export interface SwapExecution {
  adapter: string;
  kind: "tx" | "order";
  approvalTx?: string;
  swapTx?: string;
  orderUid?: string;
  from: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  minBuyAmount: string;
  hint: string;
}

async function sendRawFrom(ctx: ExecuteContext, from: string, to: string, data: string, value: bigint): Promise<string> {
  const client = evmClient(ctx.info, ctx.rpc);
  const [nonce, fees] = await Promise.all([client.getTransactionCount({ address: from as `0x${string}`, blockTag: "pending" }), client.estimateFeesPerGas()]);
  const gas = await client.estimateGas({ account: from as `0x${string}`, to: to as `0x${string}`, data: data as `0x${string}`, value }).catch((e) => {
    throw new CodedError("SWAP_TX_FAILED", String(e?.shortMessage ?? e?.message ?? e).slice(0, 300), "The swap or approval would revert; re-quote (routes expire) or check balances");
  });
  const signed = await signEvmTx({
    wallet: ctx.wallet,
    passphrase: ctx.passphrase,
    index: ctx.index,
    chainId: ctx.info.chainId,
    to,
    valueWei: value.toString(),
    data,
    nonce,
    gasLimit: ((gas * 120n) / 100n).toString(),
    maxFeePerGas: fees.maxFeePerGas.toString(),
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
  });
  return client.request({ method: "eth_sendRawTransaction", params: [signed.rawTx as `0x${string}`] }) as Promise<string>;
}

/** Approve the spender for sellAmount if current allowance is short. Returns the approval tx hash or undefined. */
async function ensureAllowance(ctx: ExecuteContext, from: string, token: string, spender: string, needed: bigint, wait: boolean): Promise<string | undefined> {
  const client = evmClient(ctx.info, ctx.rpc);
  const current = (await client.readContract({ address: token as `0x${string}`, abi: erc20Abi, functionName: "allowance", args: [from as `0x${string}`, spender as `0x${string}`] })) as bigint;
  if (current >= needed) return undefined;
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender as `0x${string}`, needed] });
  const hash = await sendRawFrom(ctx, from, token, data, 0n);
  if (wait) await client.waitForTransactionReceipt({ hash: hash as `0x${string}`, timeout: 120000 }).catch(() => null);
  return hash;
}

export async function executeSwap(quote: SwapQuote, ctx: ExecuteContext, wait: boolean): Promise<SwapExecution> {
  // Gate BEFORE any signing or broadcast. Swap value is the sell amount in base units.
  decide({
    kind: "swap",
    chain: { family: "evm", name: ctx.info.name, testnet: ctx.info.testnet, chainId: ctx.info.chainId },
    valueBaseUnits: quote.sellAmount,
  });
  const from = evmAccount(await unlockMnemonic(ctx.wallet, ctx.passphrase), ctx.index).address;

  const approvalTx = await ensureAllowance(ctx, from, quote.sellToken, quote.spender, BigInt(quote.sellAmount), wait);

  const common = {
    adapter: quote.adapter,
    from,
    sellToken: quote.sellToken,
    buyToken: quote.buyToken,
    sellAmount: quote.sellAmount,
    minBuyAmount: quote.minBuyAmount,
    ...(approvalTx && { approvalTx }),
  };

  if (quote.execution.kind === "tx") {
    if (!quote.execution.to.startsWith("0x") || quote.execution.data.includes("UNSUPPORTED")) {
      throw new CodedError("SWAP_EXEC_UNSUPPORTED", `${quote.adapter} produced no executable calldata`, "This adapter is quote-only here; execute via kyber or cow");
    }
    const swapTx = await sendRawFrom(ctx, from, quote.execution.to, quote.execution.data, BigInt(quote.execution.value));
    return { ...common, kind: "tx", swapTx, hint: `Track with: agent-wallet tx ${ctx.info.name} ${swapTx}` };
  }

  // CoW order: sign EIP-712 and post. Solvers execute; no gas tx from us.
  const account = evmAccount(await unlockMnemonic(ctx.wallet, ctx.passphrase), ctx.index);
  const signature = await account.signTypedData({
    domain: { name: "Gnosis Protocol", version: "v2", chainId: ctx.info.chainId, verifyingContract: GPV2_SETTLEMENT as `0x${string}` },
    types: COW_ORDER_TYPES as any,
    primaryType: "Order",
    message: quote.execution.order as any,
  });
  const fetchFn = (ctx.fetchFn ?? fetch) as (u: string, o?: any) => Promise<any>;
  const res = await fetchFn(quote.execution.postUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...quote.execution.order, from, signature, signingScheme: "eip712" }),
  });
  const text = await res.text();
  if (!res.ok) throw new CodedError("SWAP_ORDER_REJECTED", `cow order post returned ${res.status}: ${text.slice(0, 200)}`, "Re-quote; the order or fee may have expired");
  const orderUid = text.replace(/^"|"$/g, "");
  return { ...common, kind: "order", orderUid, hint: `Track the order at https://explorer.cow.fi/orders/${orderUid}` };
}
