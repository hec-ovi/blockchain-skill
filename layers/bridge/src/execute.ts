import { encodeFunctionData, erc20Abi } from "viem";
import { CodedError } from "../../core/src/envelope.ts";
import { evmClient } from "../../chains/src/evm.ts";
import { decide } from "../../gate/src/policy.ts";
import { evmAccount } from "../../keys/src/derive.ts";
import { unlockMnemonic } from "../../keys/src/wallet.ts";
import { signEvmTx } from "../../sign/src/evm.ts";
import type { BridgeQuote } from "./lifi.ts";
import type { EvmChainInfo, FetchLike } from "../../chains/src/registry.ts";

const NATIVE = "0x0000000000000000000000000000000000000000";
const NATIVE_EEEE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export interface BridgeExecuteContext {
  wallet: string;
  passphrase: string;
  index: number;
  info: EvmChainInfo;
  rpc?: string;
  fetchFn?: FetchLike;
}

export interface BridgeExecution {
  tool: string;
  fromChainId: number;
  toChainId: number;
  from: string;
  approvalTx?: string;
  sourceTx: string;
  toAmountMin: string;
  status: "broadcast";
  hint: string;
}

async function sendRawFrom(ctx: BridgeExecuteContext, from: string, to: string, data: string, value: bigint): Promise<string> {
  const client = evmClient(ctx.info, ctx.rpc);
  const [nonce, fees] = await Promise.all([client.getTransactionCount({ address: from as `0x${string}`, blockTag: "pending" }), client.estimateFeesPerGas()]);
  const gas = await client.estimateGas({ account: from as `0x${string}`, to: to as `0x${string}`, data: data as `0x${string}`, value }).catch((e) => {
    throw new CodedError("BRIDGE_TX_FAILED", String(e?.shortMessage ?? e?.message ?? e).slice(0, 300), "The bridge tx or approval would revert; re-quote (routes expire) or check balances");
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

function isNative(token: string): boolean {
  return token === NATIVE || token.toLowerCase() === NATIVE_EEEE.toLowerCase();
}

export async function executeBridge(quote: BridgeQuote, ctx: BridgeExecuteContext, wait: boolean): Promise<BridgeExecution> {
  decide({
    kind: "bridge",
    chain: { family: "evm", name: ctx.info.name, testnet: ctx.info.testnet, chainId: ctx.info.chainId },
    valueBaseUnits: quote.fromAmount,
  });
  const from = evmAccount(await unlockMnemonic(ctx.wallet, ctx.passphrase), ctx.index).address;
  const client = evmClient(ctx.info, ctx.rpc);

  let approvalTx: string | undefined;
  if (!isNative(quote.fromToken) && quote.approvalAddress) {
    const current = (await client.readContract({ address: quote.fromToken as `0x${string}`, abi: erc20Abi, functionName: "allowance", args: [from as `0x${string}`, quote.approvalAddress as `0x${string}`] })) as bigint;
    if (current < BigInt(quote.fromAmount)) {
      const data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [quote.approvalAddress as `0x${string}`, BigInt(quote.fromAmount)] });
      approvalTx = await sendRawFrom(ctx, from, quote.fromToken, data, 0n);
      if (wait) await client.waitForTransactionReceipt({ hash: approvalTx as `0x${string}`, timeout: 120000 }).catch(() => null);
    }
  }

  const sourceTx = await sendRawFrom(ctx, from, quote.transactionRequest.to, quote.transactionRequest.data, BigInt(quote.transactionRequest.value));
  return {
    tool: quote.tool,
    fromChainId: quote.fromChainId,
    toChainId: quote.toChainId,
    from,
    ...(approvalTx && { approvalTx }),
    sourceTx,
    toAmountMin: quote.toAmountMin,
    status: "broadcast",
    hint: `Track cross-chain delivery with: agent-wallet bridge-status ${sourceTx} --from-chain ${quote.fromChainId} --to-chain ${quote.toChainId}`,
  };
}
