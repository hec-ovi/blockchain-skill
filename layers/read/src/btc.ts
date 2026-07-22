import { CodedError } from "../../core/src/envelope.ts";
import { bitcoindCall, esploraGet } from "../../chains/src/btc.ts";
import type { BtcChainInfo, FetchLike } from "../../chains/src/registry.ts";

function useBitcoind(info: BtcChainInfo): boolean {
  return info.esploraUrls.length === 0;
}

export interface BtcBalance {
  family: "btc";
  address: string;
  confirmedSats: string;
  mempoolSats: string;
  totalSats: string;
  formatted: string;
}

function sats(n: number | bigint): bigint {
  return BigInt(Math.round(Number(n)));
}

function fmtBtc(satsTotal: bigint): string {
  const neg = satsTotal < 0n;
  const abs = neg ? -satsTotal : satsTotal;
  return `${neg ? "-" : ""}${abs / 100000000n}.${(abs % 100000000n).toString().padStart(8, "0")}`;
}

export async function btcBalance(info: BtcChainInfo, address: string, fetchFn?: FetchLike): Promise<BtcBalance> {
  if (useBitcoind(info)) {
    const scan = (await bitcoindCall(info, "scantxoutset", ["start", [`addr(${address})`]])) as { total_amount: number };
    const total = BigInt(Math.round(scan.total_amount * 1e8));
    return { family: "btc", address, confirmedSats: total.toString(), mempoolSats: "0", totalSats: total.toString(), formatted: fmtBtc(total) };
  }
  const stats = (await esploraGet(info, `/address/${address}`, fetchFn)) as {
    chain_stats: { funded_txo_sum: number; spent_txo_sum: number };
    mempool_stats: { funded_txo_sum: number; spent_txo_sum: number };
  };
  const confirmed = sats(stats.chain_stats.funded_txo_sum) - sats(stats.chain_stats.spent_txo_sum);
  const mempool = sats(stats.mempool_stats.funded_txo_sum) - sats(stats.mempool_stats.spent_txo_sum);
  const total = confirmed + mempool;
  return {
    family: "btc",
    address,
    confirmedSats: confirmed.toString(),
    mempoolSats: mempool.toString(),
    totalSats: total.toString(),
    formatted: fmtBtc(total),
  };
}

export interface BtcUtxo {
  txid: string;
  vout: number;
  valueSats: string;
  confirmed: boolean;
  height?: number;
}

export async function btcUtxos(info: BtcChainInfo, address: string, fetchFn?: FetchLike): Promise<BtcUtxo[]> {
  if (useBitcoind(info)) {
    const scan = (await bitcoindCall(info, "scantxoutset", ["start", [`addr(${address})`]])) as {
      unspents: Array<{ txid: string; vout: number; amount: number; height: number }>;
    };
    return scan.unspents.map((u) => ({
      txid: u.txid,
      vout: u.vout,
      valueSats: BigInt(Math.round(u.amount * 1e8)).toString(),
      confirmed: u.height > 0,
      height: u.height,
    }));
  }
  const utxos = (await esploraGet(info, `/address/${address}/utxo`, fetchFn)) as Array<{
    txid: string;
    vout: number;
    value: number;
    status: { confirmed: boolean; block_height?: number };
  }>;
  return utxos.map((u) => ({
    txid: u.txid,
    vout: u.vout,
    valueSats: String(u.value),
    confirmed: u.status.confirmed,
    ...(u.status.block_height !== undefined && { height: u.status.block_height }),
  }));
}

export interface BtcFees {
  family: "btc";
  fastestSatVb: number;
  halfHourSatVb: number;
  hourSatVb: number;
  economySatVb: number;
}

export async function btcFees(info: BtcChainInfo, fetchFn?: FetchLike): Promise<BtcFees> {
  if (useBitcoind(info)) {
    const est = async (target: number) => {
      const r = (await bitcoindCall(info, "estimatesmartfee", [target])) as { feerate?: number };
      return r.feerate ? Math.max(1, Math.round((r.feerate * 1e8) / 1000)) : 1;
    };
    const [fastest, half, hour, economy] = await Promise.all([est(1), est(3), est(6), est(144)]);
    return { family: "btc", fastestSatVb: fastest, halfHourSatVb: half, hourSatVb: hour, economySatVb: economy };
  }
  const fees = (await esploraGet(info, "/fee-estimates", fetchFn)) as Record<string, number>;
  const pick = (k: string) => Math.max(1, Math.ceil(fees[k] ?? 1));
  return { family: "btc", fastestSatVb: pick("1"), halfHourSatVb: pick("3"), hourSatVb: pick("6"), economySatVb: pick("144") };
}

export interface BtcTxInfo {
  family: "btc";
  txid: string;
  status: "confirmed" | "pending" | "not_found";
  blockHeight?: number;
  feeSats?: string;
  vsize?: number;
}

export async function btcTx(info: BtcChainInfo, txid: string, fetchFn?: FetchLike): Promise<BtcTxInfo> {
  if (!/^[0-9a-f]{64}$/i.test(txid)) {
    throw new CodedError("TXID_INVALID", `"${txid}" is not a transaction id`, "Expect 64 hex characters");
  }
  if (useBitcoind(info)) {
    try {
      const tx = (await bitcoindCall(info, "getrawtransaction", [txid, true])) as { confirmations?: number; vsize: number };
      const confirmed = (tx.confirmations ?? 0) > 0;
      return { family: "btc", txid, status: confirmed ? "confirmed" : "pending", vsize: tx.vsize };
    } catch (e) {
      if (e instanceof CodedError && e.message.includes("No such")) return { family: "btc", txid, status: "not_found" };
      throw e;
    }
  }
  try {
    const tx = (await esploraGet(info, `/tx/${txid}`, fetchFn)) as {
      status: { confirmed: boolean; block_height?: number };
      fee: number;
      weight: number;
    };
    return {
      family: "btc",
      txid,
      status: tx.status.confirmed ? "confirmed" : "pending",
      ...(tx.status.block_height !== undefined && { blockHeight: tx.status.block_height }),
      feeSats: String(tx.fee),
      vsize: Math.ceil(tx.weight / 4),
    };
  } catch (e) {
    if (e instanceof CodedError && e.code === "ESPLORA_UNAVAILABLE" && e.message.includes("404")) {
      return { family: "btc", txid, status: "not_found" };
    }
    throw e;
  }
}
