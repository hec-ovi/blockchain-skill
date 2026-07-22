import { encodeFunctionData, erc20Abi, isAddress, parseUnits } from "viem";
import { CodedError } from "../../core/src/envelope.ts";
import { resolveChain, type FetchLike } from "../../chains/src/registry.ts";
import { evmClient } from "../../chains/src/evm.ts";
import { decide } from "../../gate/src/policy.ts";
import { evmAccount } from "../../keys/src/derive.ts";
import { unlockMnemonic } from "../../keys/src/wallet.ts";
import { signEvmTx } from "../../sign/src/evm.ts";

export interface EvmSendRequest {
  wallet: string;
  passphrase: string;
  index?: number;
  chain: string;
  to: string;
  /** decimal amount in display units (ETH or token units); amountRaw overrides */
  amount?: string;
  /** base units (wei, or token raw) */
  amountRaw?: string;
  token?: string;
  data?: string;
  rpc?: string;
  wait?: boolean;
  timeoutMs?: number;
  fetchFn?: FetchLike;
}

export interface EvmSendResult {
  family: "evm";
  hash: string;
  from: string;
  to: string;
  token?: string;
  valueWei: string;
  nonce: number;
  status: "broadcast" | "confirmed" | "reverted";
  blockNumber?: string;
  gasUsed?: string;
  explorer?: string;
}

function addr(value: string, what: string): `0x${string}` {
  if (!isAddress(value, { strict: false })) {
    throw new CodedError("ADDRESS_INVALID", `${what} "${value}" is not a valid EVM address`);
  }
  return value as `0x${string}`;
}

export async function sendEvm(req: EvmSendRequest): Promise<EvmSendResult> {
  const info = await resolveChain(req.chain, req.fetchFn);
  if (info.family !== "evm") throw new CodedError("FAMILY_MISMATCH", `"${req.chain}" is a Bitcoin network`, "Use the btc send path for Bitcoin");
  const client = evmClient(info, req.rpc);
  const to = addr(req.to, "recipient");
  const from = evmAccount(await unlockMnemonic(req.wallet, req.passphrase), req.index ?? 0).address;

  let valueWei = 0n;
  let callTo = to;
  let data = req.data as `0x${string}` | undefined;
  let tokenRaw: bigint | undefined;
  if (req.token) {
    const token = addr(req.token, "token");
    const decimals = (await client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" })) as number;
    tokenRaw = req.amountRaw !== undefined ? BigInt(req.amountRaw) : parseUnits(req.amount ?? "0", decimals);
    if (tokenRaw <= 0n) throw new CodedError("AMOUNT_INVALID", "token amount must be positive");
    data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, tokenRaw] });
    callTo = token;
  } else {
    valueWei = req.amountRaw !== undefined ? BigInt(req.amountRaw) : parseUnits(req.amount ?? "0", info.nativeCurrency.decimals);
    if (valueWei < 0n || (valueWei === 0n && !data)) throw new CodedError("AMOUNT_INVALID", "amount must be positive (or provide data)");
  }

  decide({
    kind: "send",
    chain: { family: "evm", name: info.name, testnet: info.testnet, chainId: info.chainId },
    valueBaseUnits: valueWei.toString(),
  });

  const [nonce, fees, balance] = await Promise.all([
    client.getTransactionCount({ address: from, blockTag: "pending" }),
    client.estimateFeesPerGas(),
    client.getBalance({ address: from }),
  ]);
  const gas = await client
    .estimateGas({ account: from, to: callTo, value: valueWei, ...(data && { data }) })
    .catch((e) => {
      throw new CodedError("GAS_ESTIMATE_FAILED", String(e?.shortMessage ?? e?.message ?? e).slice(0, 300), "The transaction would revert; check balances, allowances and calldata");
    });
  const gasLimit = (gas * 120n) / 100n;
  const worstCase = valueWei + gasLimit * fees.maxFeePerGas;
  if (worstCase > balance) {
    throw new CodedError("INSUFFICIENT_FUNDS", `need up to ${worstCase} wei (value + gas), balance is ${balance}`, "Lower the amount or fund the sender");
  }

  const signed = await signEvmTx({
    wallet: req.wallet,
    passphrase: req.passphrase,
    index: req.index ?? 0,
    chainId: info.chainId,
    to: callTo,
    valueWei: valueWei.toString(),
    ...(data && { data }),
    nonce,
    gasLimit: gasLimit.toString(),
    maxFeePerGas: fees.maxFeePerGas.toString(),
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
  });

  const hash = (await client.request({ method: "eth_sendRawTransaction", params: [signed.rawTx as `0x${string}`] })) as string;

  const base: EvmSendResult = {
    family: "evm",
    hash,
    from,
    to,
    ...(req.token && { token: req.token }),
    valueWei: (tokenRaw ?? valueWei).toString(),
    nonce,
    status: "broadcast",
    ...(info.explorers[0] && { explorer: `${info.explorers[0]}/tx/${hash}` }),
  };
  if (!req.wait) return base;

  const receipt = await client
    .waitForTransactionReceipt({ hash: hash as `0x${string}`, timeout: req.timeoutMs ?? 120000 })
    .catch(() => null);
  if (!receipt) {
    throw new CodedError("CONFIRM_TIMEOUT", `tx ${hash} was broadcast but not confirmed in time`, `Check later with: agent-wallet tx ${req.chain} ${hash}`);
  }
  return {
    ...base,
    status: receipt.status === "success" ? "confirmed" : "reverted",
    blockNumber: receipt.blockNumber.toString(),
    gasUsed: receipt.gasUsed.toString(),
  };
}
