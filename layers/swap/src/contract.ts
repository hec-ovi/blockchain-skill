import { z } from "zod";

const digits = z.string().regex(/^\d+$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hashOpt = z.string().regex(/^0x[0-9a-f]{64}$/i).optional();

export const swapQuoteOutput = z
  .object({
    adapter: z.string(),
    chainId: z.number().int().positive(),
    sellToken: address,
    buyToken: address,
    sellAmount: digits,
    buyAmount: digits,
    minBuyAmount: digits,
    spender: z.string(),
    estimatedGas: z.string().optional(),
    execution: z.union([
      z.object({ kind: z.literal("tx"), to: z.string(), data: z.string(), value: digits }).strict(),
      z.object({ kind: z.literal("order"), order: z.record(z.string(), z.unknown()), postUrl: z.string() }).strict(),
    ]),
  })
  .strict();

export const swapExecuteOutput = z
  .object({
    adapter: z.string(),
    kind: z.enum(["tx", "order"]),
    approvalTx: hashOpt,
    swapTx: hashOpt,
    orderUid: z.string().optional(),
    from: address,
    sellToken: address,
    buyToken: address,
    sellAmount: digits,
    minBuyAmount: digits,
    hint: z.string(),
  })
  .strict();

export const schemas: Record<string, z.ZodType> = {
  "swap-quote-output": swapQuoteOutput,
  "swap-execute-output": swapExecuteOutput,
};
