import { CodedError } from "../../core/src/envelope.ts";
import { resolveChain, type FetchLike } from "../../chains/src/registry.ts";
import { broadcastBtcTx, type PostLike } from "../../chains/src/btc.ts";
import { decide } from "../../gate/src/policy.ts";
import { btcFees, btcUtxos } from "../../read/src/btc.ts";
import { signBtcTx } from "../../sign/src/btc.ts";
import { deriveBtcAddress, type BtcAddressType } from "../../keys/src/derive.ts";
import { unlockMnemonic } from "../../keys/src/wallet.ts";

export interface BtcSendRequest {
  wallet: string;
  passphrase: string;
  index?: number;
  chain: string;
  to: string;
  /** decimal BTC amount; amountRaw (sats) or "all" override */
  amount?: string;
  amountRaw?: string;
  addressType?: BtcAddressType;
  feeRateSatVb?: number;
  fetchFn?: FetchLike;
  postFn?: PostLike;
}

export interface BtcSendResult {
  family: "btc";
  txid: string;
  from: string;
  to: string;
  amountSats: string;
  feeSats: string;
  changeSats: string;
  vsize: number;
  feeRateSatVb: number;
  status: "broadcast";
  hint: string;
}

function toSats(req: BtcSendRequest): string {
  if (req.amountRaw !== undefined) return req.amountRaw;
  const amount = req.amount ?? "";
  if (!/^\d+(\.\d{1,8})?$/.test(amount)) {
    throw new CodedError("AMOUNT_INVALID", `amount "${amount}" is not a decimal BTC value`, 'Pass --amount like 0.001, --amount-raw in sats, or --amount-raw all to sweep');
  }
  const [whole, frac = ""] = amount.split(".");
  return (BigInt(whole!) * 100000000n + BigInt(frac.padEnd(8, "0"))).toString();
}

export async function sendBtc(req: BtcSendRequest): Promise<BtcSendResult> {
  const info = await resolveChain(req.chain, req.fetchFn);
  if (info.family !== "btc") throw new CodedError("FAMILY_MISMATCH", `"${req.chain}" is an EVM chain`, "Use the EVM send path");
  const amountSats = req.amountRaw === "all" ? "all" : toSats(req);
  const gateChain = { family: "btc" as const, name: info.name, testnet: info.testnet, network: info.network };
  // Mainnet opt-in is checked before any network read; the amount cap re-checks below once the sweep total is known.
  decide({ kind: "send", chain: gateChain, ...(amountSats !== "all" && { valueBaseUnits: amountSats }) });

  const mnemonic = await unlockMnemonic(req.wallet, req.passphrase);
  const own = deriveBtcAddress(mnemonic, req.index ?? 0, info.network, req.addressType ?? "p2tr");

  const spendable = await btcUtxos(info, own.address, req.fetchFn);
  const total = spendable.filter((u) => u.confirmed).reduce((s, u) => s + BigInt(u.valueSats), 0n);
  if (amountSats === "all") decide({ kind: "send", chain: gateChain, valueBaseUnits: total.toString() });

  const feeRate = req.feeRateSatVb ?? (await btcFees(info, req.fetchFn)).halfHourSatVb;
  const signed = await signBtcTx({
    wallet: req.wallet,
    passphrase: req.passphrase,
    index: req.index ?? 0,
    network: info.network,
    addressType: req.addressType ?? "p2tr",
    to: req.to,
    amountSats,
    feeRateSatVb: feeRate,
    utxos: spendable,
  });

  const txid = await broadcastBtcTx(info, signed.txHex, req.postFn);
  return {
    family: "btc",
    txid,
    from: own.address,
    to: req.to,
    amountSats: amountSats === "all" ? (total - BigInt(signed.feeSats)).toString() : amountSats,
    feeSats: signed.feeSats,
    changeSats: signed.changeSats,
    vsize: signed.vsize,
    feeRateSatVb: feeRate,
    status: "broadcast",
    hint: `Track with: agent-wallet tx ${info.network} ${txid}`,
  };
}
