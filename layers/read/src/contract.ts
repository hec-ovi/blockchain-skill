import { z } from "zod";

const digits = z.string().regex(/^-?\d+$/);

export const evmBalanceOutput = z
  .object({ family: z.literal("evm"), address: z.string(), wei: digits, formatted: z.string(), symbol: z.string() })
  .strict();

export const evmTokenBalanceOutput = z
  .object({
    family: z.literal("evm"),
    token: z.string(),
    holder: z.string(),
    raw: digits,
    formatted: z.string(),
    symbol: z.string(),
    decimals: z.number().int().min(0).max(255),
  })
  .strict();

export const btcBalanceOutput = z
  .object({
    family: z.literal("btc"),
    address: z.string(),
    confirmedSats: digits,
    mempoolSats: digits,
    totalSats: digits,
    formatted: z.string(),
  })
  .strict();

export const balanceOutput = z.union([evmBalanceOutput, evmTokenBalanceOutput, btcBalanceOutput]);

export const utxoListOutput = z.array(
  z
    .object({
      txid: z.string().regex(/^[0-9a-f]{64}$/i),
      vout: z.number().int().min(0),
      valueSats: digits,
      confirmed: z.boolean(),
      height: z.number().int().optional(),
    })
    .strict(),
);

export const feesOutput = z.union([
  z
    .object({
      family: z.literal("evm"),
      maxFeePerGas: digits,
      maxPriorityFeePerGas: digits,
      baseFeePerGas: digits.optional(),
    })
    .strict(),
  z
    .object({
      family: z.literal("btc"),
      fastestSatVb: z.number().min(1),
      halfHourSatVb: z.number().min(1),
      hourSatVb: z.number().min(1),
      economySatVb: z.number().min(1),
    })
    .strict(),
]);

export const txStatusOutput = z.union([
  z
    .object({
      family: z.literal("evm"),
      hash: z.string(),
      status: z.enum(["confirmed", "reverted", "pending", "not_found"]),
      blockNumber: digits.optional(),
      from: z.string().optional(),
      to: z.string().nullable().optional(),
      valueWei: digits.optional(),
      gasUsed: digits.optional(),
    })
    .strict(),
  z
    .object({
      family: z.literal("btc"),
      txid: z.string(),
      status: z.enum(["confirmed", "pending", "not_found"]),
      blockHeight: z.number().int().optional(),
      feeSats: digits.optional(),
      vsize: z.number().int().optional(),
    })
    .strict(),
]);

export const schemas: Record<string, z.ZodType> = {
  "balance-output": balanceOutput,
  "utxo-list-output": utxoListOutput,
  "fees-output": feesOutput,
  "tx-status-output": txStatusOutput,
};
