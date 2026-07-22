import { HDKey } from "@scure/bip32";
import { CodedError } from "../../core/src/envelope.ts";
import { mnemonicToSeedSync } from "@scure/bip39";
import { mnemonicToAccount } from "viem/accounts";
import * as btc from "@scure/btc-signer";

export type BtcNetworkName = "bitcoin" | "signet" | "testnet";
export type BtcAddressType = "p2tr" | "p2wpkh";

export const BTC_NETWORKS: Record<BtcNetworkName, typeof btc.NETWORK> = {
  bitcoin: btc.NETWORK,
  signet: btc.TEST_NETWORK,
  testnet: btc.TEST_NETWORK,
};

export interface DerivedEvm {
  family: "evm";
  index: number;
  path: string;
  address: string;
}

export interface DerivedBtc {
  family: "btc";
  index: number;
  path: string;
  address: string;
  network: BtcNetworkName;
  addressType: BtcAddressType;
}

/** m/44'/60'/0'/0/index, the path every EVM wallet agrees on. */
export function deriveEvmAddress(mnemonic: string, index: number): DerivedEvm {
  const account = mnemonicToAccount(mnemonic, { addressIndex: index });
  return { family: "evm", index, path: `m/44'/60'/0'/0/${index}`, address: account.address };
}

/** Signing account for the sign layer; never leaves the process. */
export function evmAccount(mnemonic: string, index: number) {
  return mnemonicToAccount(mnemonic, { addressIndex: index });
}

function btcNode(mnemonic: string, purpose: 84 | 86, network: BtcNetworkName, index: number): { key: HDKey; path: string } {
  const coin = network === "bitcoin" ? 0 : 1;
  const path = `m/${purpose}'/${coin}'/0'/0/${index}`;
  const key = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic)).derive(path);
  return { key, path };
}

/** BIP-86 taproot by default, BIP-84 native segwit as the compatibility option. */
export function deriveBtcAddress(
  mnemonic: string,
  index: number,
  network: BtcNetworkName = "bitcoin",
  addressType: BtcAddressType = "p2tr",
): DerivedBtc {
  const net = BTC_NETWORKS[network];
  const { key, path } = btcNode(mnemonic, addressType === "p2tr" ? 86 : 84, network, index);
  if (!key.publicKey) throw new CodedError("KEY_DERIVE_FAILED", "no public key at path");
  const payment =
    addressType === "p2tr"
      ? btc.p2tr(key.publicKey.slice(1), undefined, net)
      : btc.p2wpkh(key.publicKey, net);
  if (!payment.address) throw new CodedError("KEY_DERIVE_FAILED", "no address for payment script");
  return { family: "btc", index, path, address: payment.address, network, addressType };
}

/** Signing key for the sign layer; never leaves the process. */
export function btcPrivateKey(
  mnemonic: string,
  index: number,
  network: BtcNetworkName = "bitcoin",
  addressType: BtcAddressType = "p2tr",
): Uint8Array {
  const { key } = btcNode(mnemonic, addressType === "p2tr" ? 86 : 84, network, index);
  if (!key.privateKey) throw new CodedError("KEY_DERIVE_FAILED", "no private key at path");
  return key.privateKey;
}
