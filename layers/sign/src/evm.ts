import { isAddress, keccak256, type TransactionSerializable } from "viem";
import { CodedError } from "../../core/src/envelope.ts";
import { evmAccount } from "../../keys/src/derive.ts";
import { unlockMnemonic } from "../../keys/src/wallet.ts";

function assertAddress(value: string): `0x${string}` {
  if (!isAddress(value, { strict: false })) {
    throw new CodedError("ADDRESS_INVALID", `"${value}" is not a valid EVM address`, "Expect 0x followed by 40 hex characters");
  }
  return value as `0x${string}`;
}

export interface EvmSignRequest {
  wallet: string;
  passphrase: string;
  index?: number;
  chainId: number;
  to?: string;
  valueWei?: string;
  data?: string;
  nonce: number;
  gasLimit: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}

export interface EvmSigned {
  family: "evm";
  rawTx: string;
  hash: string;
  from: string;
  chainId: number;
  nonce: number;
}

function digitsToBigint(name: string, value: string): bigint {
  if (!/^\d+$/.test(value)) throw new CodedError("AMOUNT_INVALID", `${name} must be a base-unit decimal string, got "${value}"`);
  return BigInt(value);
}

/** Signs an EIP-1559 transaction fully offline; caller supplies nonce and fees. */
export async function signEvmTx(req: EvmSignRequest): Promise<EvmSigned> {
  const mnemonic = await unlockMnemonic(req.wallet, req.passphrase);
  const account = evmAccount(mnemonic, req.index ?? 0);
  if (req.to === undefined && req.data === undefined) {
    throw new CodedError("TX_EMPTY", "a transaction needs a to address, data, or both");
  }
  const tx: TransactionSerializable = {
    chainId: req.chainId,
    type: "eip1559",
    nonce: req.nonce,
    gas: digitsToBigint("gasLimit", req.gasLimit),
    maxFeePerGas: digitsToBigint("maxFeePerGas", req.maxFeePerGas),
    maxPriorityFeePerGas: digitsToBigint("maxPriorityFeePerGas", req.maxPriorityFeePerGas),
    ...(req.to !== undefined && { to: assertAddress(req.to) }),
    ...(req.valueWei !== undefined && { value: digitsToBigint("valueWei", req.valueWei) }),
    ...(req.data !== undefined && { data: req.data as `0x${string}` }),
  };
  const rawTx = await account.signTransaction(tx);
  return { family: "evm", rawTx, hash: keccak256(rawTx), from: account.address, chainId: req.chainId, nonce: req.nonce };
}

export interface EvmMessageSigned {
  family: "evm";
  signature: string;
  address: string;
}

export async function signEvmMessage(wallet: string, passphrase: string, index: number, message: string): Promise<EvmMessageSigned> {
  const account = evmAccount(await unlockMnemonic(wallet, passphrase), index);
  return { family: "evm", signature: await account.signMessage({ message }), address: account.address };
}

export async function signEvmTypedData(wallet: string, passphrase: string, index: number, typedDataJson: string): Promise<EvmMessageSigned> {
  const account = evmAccount(await unlockMnemonic(wallet, passphrase), index);
  let typed: any;
  try {
    typed = JSON.parse(typedDataJson);
  } catch {
    throw new CodedError("TYPED_DATA_INVALID", "typed data is not valid JSON", "Pass the full EIP-712 payload: domain, types, primaryType, message");
  }
  if (!typed?.types || !typed?.primaryType || !typed?.message) {
    throw new CodedError("TYPED_DATA_INVALID", "typed data must include types, primaryType and message");
  }
  return { family: "evm", signature: await account.signTypedData(typed), address: account.address };
}
