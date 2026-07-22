import { encodeDeployData } from "viem";
import { CodedError } from "../../core/src/envelope.ts";
import { resolveChain, type FetchLike } from "../../chains/src/registry.ts";
import { evmClient } from "../../chains/src/evm.ts";
import { decide } from "../../gate/src/policy.ts";
import { evmAccount } from "../../keys/src/derive.ts";
import { unlockMnemonic } from "../../keys/src/wallet.ts";
import { signEvmTx } from "../../sign/src/evm.ts";
import { compileSource, type CompiledContract } from "./compile.ts";

export interface DeployRequest {
  wallet: string;
  passphrase: string;
  index?: number;
  chain: string;
  /** Solidity source; compiled here. Or pass abi + bytecode directly. */
  source?: string;
  sourceName?: string;
  contractName?: string;
  abi?: unknown[];
  bytecode?: string;
  constructorArgs?: unknown[];
  rpc?: string;
  timeoutMs?: number;
  fetchFn?: FetchLike;
}

export interface DeployResult {
  chain: string;
  chainId: number;
  address: string;
  txHash: string;
  deployer: string;
  contractName: string;
  abi: unknown[];
  compilerVersion?: string;
  gasUsed: string;
  explorer?: string;
}

function toBigints(args: unknown[]): unknown[] {
  return args.map((a) => (typeof a === "string" && /^\d+$/.test(a) && a.length > 15 ? BigInt(a) : a));
}

export async function deployContract(req: DeployRequest): Promise<DeployResult> {
  const info = await resolveChain(req.chain, req.fetchFn);
  if (info.family !== "evm") throw new CodedError("FAMILY_MISMATCH", "contracts deploy to EVM chains only");

  let compiled: CompiledContract | undefined;
  let abi: unknown[];
  let bytecode: string;
  if (req.source) {
    const all = compileSource(req.source, req.sourceName ?? "Contract.sol", true, req.contractName);
    compiled = req.contractName ? all.find((c) => c.contractName === req.contractName) ?? all[0] : all[all.length - 1];
    abi = compiled!.abi;
    bytecode = compiled!.bytecode;
  } else if (req.abi && req.bytecode) {
    abi = req.abi;
    bytecode = req.bytecode.startsWith("0x") ? req.bytecode : `0x${req.bytecode}`;
  } else {
    throw new CodedError("DEPLOY_INPUT_MISSING", "provide either source or abi+bytecode", "Pass --source <file> or both --abi and --bytecode");
  }

  const data = encodeDeployData({ abi: abi as any, bytecode: bytecode as `0x${string}`, args: toBigints(req.constructorArgs ?? []) as any });

  decide({ kind: "deploy", chain: { family: "evm", name: info.name, testnet: info.testnet, chainId: info.chainId } });

  const client = evmClient(info, req.rpc);
  const from = evmAccount(await unlockMnemonic(req.wallet, req.passphrase), req.index ?? 0).address;
  const [nonce, fees, balance] = await Promise.all([
    client.getTransactionCount({ address: from, blockTag: "pending" }),
    client.estimateFeesPerGas(),
    client.getBalance({ address: from }),
  ]);
  const gas = await client.estimateGas({ account: from, data }).catch((e) => {
    throw new CodedError("GAS_ESTIMATE_FAILED", String(e?.shortMessage ?? e?.message ?? e).slice(0, 300), "The constructor would revert; check constructor args");
  });
  const gasLimit = (gas * 120n) / 100n;
  if (gasLimit * fees.maxFeePerGas > balance) {
    throw new CodedError("INSUFFICIENT_FUNDS", `deployment gas exceeds balance ${balance} wei`, "Fund the deployer address");
  }

  const signed = await signEvmTx({
    wallet: req.wallet,
    passphrase: req.passphrase,
    index: req.index ?? 0,
    chainId: info.chainId,
    data,
    nonce,
    gasLimit: gasLimit.toString(),
    maxFeePerGas: fees.maxFeePerGas.toString(),
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
  });
  const hash = (await client.request({ method: "eth_sendRawTransaction", params: [signed.rawTx as `0x${string}`] })) as `0x${string}`;
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: req.timeoutMs ?? 120000 }).catch(() => null);
  if (!receipt) throw new CodedError("CONFIRM_TIMEOUT", `deploy tx ${hash} not confirmed in time`, `Check with: agent-wallet tx ${req.chain} ${hash}`);
  if (receipt.status !== "success" || !receipt.contractAddress) {
    throw new CodedError("DEPLOY_REVERTED", `deployment reverted in ${hash}`, "The constructor failed on-chain");
  }

  return {
    chain: info.name,
    chainId: info.chainId,
    address: receipt.contractAddress,
    txHash: hash,
    deployer: from,
    contractName: compiled?.contractName ?? req.contractName ?? "Contract",
    abi,
    ...(compiled?.compilerVersion && { compilerVersion: compiled.compilerVersion }),
    gasUsed: receipt.gasUsed.toString(),
    ...(info.explorers[0] && { explorer: `${info.explorers[0]}/address/${receipt.contractAddress}` }),
  };
}
