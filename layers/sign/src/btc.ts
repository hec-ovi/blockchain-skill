import * as btc from "@scure/btc-signer";
import { CodedError } from "../../core/src/envelope.ts";
import { BTC_NETWORKS, btcPrivateKey, deriveBtcAddress, type BtcAddressType, type BtcNetworkName } from "../../keys/src/derive.ts";
import { unlockMnemonic } from "../../keys/src/wallet.ts";
import { secp256k1 } from "ethereum-cryptography/secp256k1.js";

export const DUST_SATS = 546n;

export interface BtcSignRequest {
  wallet: string;
  passphrase: string;
  index?: number;
  network: BtcNetworkName;
  addressType?: BtcAddressType;
  to: string;
  /** decimal sats, or "all" to sweep every confirmed utxo */
  amountSats: string;
  feeRateSatVb: number;
  utxos: Array<{ txid: string; vout: number; valueSats: string; confirmed: boolean }>;
}

export interface BtcSigned {
  family: "btc";
  txHex: string;
  txid: string;
  vsize: number;
  feeSats: string;
  changeSats: string;
  inputs: number;
  outputs: number;
  from: string;
}

/** Conservative virtual-size estimate used to compute the fee before signing. */
function estimateVsize(inputs: number, outputs: number, type: BtcAddressType): number {
  const perInput = type === "p2tr" ? 58 : 68;
  const perOutput = 43;
  return Math.ceil(11 + inputs * perInput + outputs * perOutput);
}

export async function signBtcTx(req: BtcSignRequest): Promise<BtcSigned> {
  const net = BTC_NETWORKS[req.network];
  const addressType = req.addressType ?? "p2tr";
  const index = req.index ?? 0;
  const rate = req.feeRateSatVb;
  if (!Number.isFinite(rate) || rate < 1 || rate > 5000) {
    throw new CodedError("FEE_RATE_INVALID", `fee rate ${rate} sat/vB is out of range 1..5000`);
  }
  try {
    btc.Address(net).decode(req.to);
  } catch {
    throw new CodedError("ADDRESS_INVALID", `"${req.to}" is not a valid ${req.network} address`, "Check the address and that it belongs to this network");
  }

  const mnemonic = await unlockMnemonic(req.wallet, req.passphrase);
  const own = deriveBtcAddress(mnemonic, index, req.network, addressType);
  const priv = btcPrivateKey(mnemonic, index, req.network, addressType);
  const pub = secp256k1.getPublicKey(priv, true);
  const payment = addressType === "p2tr" ? btc.p2tr(pub.slice(1), undefined, net) : btc.p2wpkh(pub, net);

  const spendable = req.utxos
    .filter((u) => u.confirmed)
    .map((u) => ({ ...u, value: BigInt(u.valueSats) }))
    .sort((a, b) => (a.value > b.value ? -1 : 1));
  if (spendable.length === 0) {
    throw new CodedError("NO_UTXOS", "no confirmed utxos to spend", "Fund the address and wait for a confirmation; check with the utxos verb");
  }

  const sweep = req.amountSats === "all";
  const want = sweep ? 0n : BigInt(/^\d+$/.test(req.amountSats) ? req.amountSats : -1);
  if (!sweep && want <= 0n) {
    throw new CodedError("AMOUNT_INVALID", `amountSats must be a positive decimal string or "all", got "${req.amountSats}"`);
  }

  const selected: typeof spendable = [];
  let inTotal = 0n;
  let fee = 0n;
  if (sweep) {
    selected.push(...spendable);
    inTotal = spendable.reduce((s, u) => s + u.value, 0n);
    fee = BigInt(estimateVsize(selected.length, 1, addressType)) * BigInt(rate);
    if (inTotal <= fee + DUST_SATS) {
      throw new CodedError("INSUFFICIENT_FUNDS", `total ${inTotal} sats cannot cover the ${fee} sat fee`, "Lower the fee rate or fund the address");
    }
  } else {
    for (const u of spendable) {
      selected.push(u);
      inTotal += u.value;
      fee = BigInt(estimateVsize(selected.length, 2, addressType)) * BigInt(rate);
      if (inTotal >= want + fee) break;
    }
    if (inTotal < want + fee) {
      throw new CodedError(
        "INSUFFICIENT_FUNDS",
        `need ${want + fee} sats (amount + fee), have ${inTotal} confirmed`,
        "Lower the amount or fee rate, or fund the address",
      );
    }
  }

  const amount = sweep ? inTotal - fee : want;
  let change = sweep ? 0n : inTotal - want - fee;
  if (change > 0n && change < DUST_SATS) {
    fee += change;
    change = 0n;
  }

  const tx = new btc.Transaction();
  for (const u of selected) {
    tx.addInput({
      txid: u.txid,
      index: u.vout,
      witnessUtxo: { script: payment.script, amount: u.value },
      ...(addressType === "p2tr" && { tapInternalKey: pub.slice(1) }),
    });
  }
  tx.addOutputAddress(req.to, amount, net);
  if (change > 0n) tx.addOutputAddress(own.address, change, net);
  tx.sign(priv);
  tx.finalize();

  return {
    family: "btc",
    txHex: tx.hex,
    txid: tx.id,
    vsize: tx.vsize,
    feeSats: fee.toString(),
    changeSats: change.toString(),
    inputs: selected.length,
    outputs: change > 0n ? 2 : 1,
    from: own.address,
  };
}

/** True when this wallet/index/network/type derivation produced the given address (sanity guard for send). */
export function ownsAddress(mnemonic: string, index: number, network: BtcNetworkName, type: BtcAddressType, address: string): boolean {
  return deriveBtcAddress(mnemonic, index, network, type).address === address;
}
