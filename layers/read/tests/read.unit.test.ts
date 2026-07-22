import { describe, expect, it } from "vitest";
import type { FetchLike } from "../../chains/src/registry.ts";
import { balance, fees, txStatus, utxos } from "../src/api.ts";
import { balanceOutput, feesOutput, txStatusOutput, utxoListOutput } from "../src/contract.ts";

const ADDR = "tb1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxq8t2pqv";
const TXID = "a".repeat(64);

/** Routes esplora paths to fixture bodies; anything else explodes. */
function esploraFake(routes: Record<string, unknown>): FetchLike {
  return async (url: string) => {
    for (const [suffix, body] of Object.entries(routes)) {
      if (url.endsWith(suffix)) return { ok: true, status: 200, json: async () => body };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

describe("btc reads over esplora (fixtures, no network)", () => {
  it("balance splits confirmed and mempool sats", async () => {
    const env = await balance({
      chain: "signet",
      address: ADDR,
      fetchFn: esploraFake({
        [`/address/${ADDR}`]: {
          chain_stats: { funded_txo_sum: 150000, spent_txo_sum: 50000 },
          mempool_stats: { funded_txo_sum: 7000, spent_txo_sum: 0 },
        },
      }),
    });
    expect(env.ok).toBe(true);
    const data = balanceOutput.parse(env.data);
    if (data.family !== "btc") throw new Error("expected btc");
    expect(data.confirmedSats).toBe("100000");
    expect(data.mempoolSats).toBe("7000");
    expect(data.totalSats).toBe("107000");
    expect(data.formatted).toBe("0.00107000");
  });

  it("utxos map esplora fields and validate", async () => {
    const env = await utxos({
      chain: "signet",
      address: ADDR,
      fetchFn: esploraFake({
        [`/address/${ADDR}/utxo`]: [
          { txid: TXID, vout: 1, value: 42000, status: { confirmed: true, block_height: 210000 } },
          { txid: TXID, vout: 2, value: 1000, status: { confirmed: false } },
        ],
      }),
    });
    const list = utxoListOutput.parse(env.data);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ vout: 1, valueSats: "42000", confirmed: true, height: 210000 });
    expect(list[1]?.confirmed).toBe(false);
  });

  it("fees floor at 1 sat/vB and validate", async () => {
    const env = await fees({ chain: "signet", fetchFn: esploraFake({ "/fee-estimates": { "1": 12.3, "3": 8.1, "6": 0.9, "144": 0.5 } }) });
    const data = feesOutput.parse(env.data);
    if (data.family !== "btc") throw new Error("expected btc");
    expect(data.fastestSatVb).toBe(13);
    expect(data.hourSatVb).toBe(1);
  });

  it("tx status carries fee and vsize; 404 becomes not_found", async () => {
    const found = await txStatus({
      chain: "signet",
      ref: TXID,
      fetchFn: esploraFake({ [`/tx/${TXID}`]: { status: { confirmed: true, block_height: 1 }, fee: 141, weight: 561 } }),
    });
    const data = txStatusOutput.parse(found.data);
    if (data.family !== "btc") throw new Error("expected btc");
    expect(data).toMatchObject({ status: "confirmed", feeSats: "141", vsize: 141 });

    const missing = await txStatus({ chain: "signet", ref: TXID, fetchFn: esploraFake({}) });
    expect((missing.data as any).status).toBe("not_found");
  });
});

describe("fail-closed validation", () => {
  it("rejects bad addresses, tx ids and family mixups", async () => {
    expect((await balance({ chain: "ethereum", address: "not-an-address" })).error?.code).toBe("ADDRESS_INVALID");
    expect((await txStatus({ chain: "signet", ref: "beef" })).error?.code).toBe("TXID_INVALID");
    expect((await txStatus({ chain: "ethereum", ref: "beef" })).error?.code).toBe("HASH_INVALID");
    expect((await utxos({ chain: "ethereum", address: ADDR })).error?.code).toBe("FAMILY_MISMATCH");
    expect((await balance({ chain: "signet" })).error?.code).toBe("PARAM_MISSING");
  });
});
