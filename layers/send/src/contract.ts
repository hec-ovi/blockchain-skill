import { z } from "zod";

const digits = z.string().regex(/^\d+$/);

export const sendInput = z
  .object({
    wallet: z.string(),
    passphrase: z.string(),
    index: z.number().int().min(0).optional(),
    chain: z.string(),
    to: z.string(),
    amount: z.string().optional(),
    amountRaw: z.union([digits, z.literal("all")]).optional(),
    token: z.string().optional(),
    data: z.string().regex(/^0x/).optional(),
    addressType: z.enum(["p2tr", "p2wpkh"]).optional(),
    feeRateSatVb: z.number().min(1).max(5000).optional(),
    rpc: z.string().optional(),
    wait: z.boolean().optional(),
    timeoutMs: z.number().int().positive().optional(),
  })
  .strict();

export const evmSendOutput = z
  .object({
    family: z.literal("evm"),
    hash: z.string().regex(/^0x[0-9a-f]{64}$/i),
    from: z.string(),
    to: z.string(),
    token: z.string().optional(),
    valueWei: digits,
    nonce: z.number().int().min(0),
    status: z.enum(["broadcast", "confirmed", "reverted"]),
    blockNumber: digits.optional(),
    gasUsed: digits.optional(),
    explorer: z.string().optional(),
  })
  .strict();

export const btcSendOutput = z
  .object({
    family: z.literal("btc"),
    txid: z.string().regex(/^[0-9a-f]{64}$/i),
    from: z.string(),
    to: z.string(),
    amountSats: digits,
    feeSats: digits,
    changeSats: digits,
    vsize: z.number().int().positive(),
    feeRateSatVb: z.number().min(1),
    status: z.literal("broadcast"),
    hint: z.string(),
  })
  .strict();

export const sendOutput = z.union([evmSendOutput, btcSendOutput]);

export const schemas: Record<string, z.ZodType> = {
  "send-input": sendInput,
  "send-output": sendOutput,
};
