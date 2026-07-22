import { z } from "zod";

const digits = z.string().regex(/^\d+$/);
const address = z.string();
const hashOpt = z.string().regex(/^0x[0-9a-f]{64}$/i).optional();

export const bridgeQuoteOutput = z
  .object({
    tool: z.string(),
    fromChainId: z.number().int().positive(),
    toChainId: z.number().int().positive(),
    fromToken: address,
    toToken: address,
    fromAmount: digits,
    toAmount: digits,
    toAmountMin: digits,
    approvalAddress: z.string().optional(),
    executionDurationSec: z.number().optional(),
    transactionRequest: z.object({ to: z.string(), data: z.string(), value: digits, chainId: z.number().int() }).strict(),
  })
  .strict();

export const bridgeExecuteOutput = z
  .object({
    tool: z.string(),
    fromChainId: z.number().int().positive(),
    toChainId: z.number().int().positive(),
    from: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    approvalTx: hashOpt,
    sourceTx: z.string().regex(/^0x[0-9a-f]{64}$/i),
    toAmountMin: digits,
    status: z.literal("broadcast"),
    hint: z.string(),
  })
  .strict();

export const bridgeStatusOutput = z
  .object({
    status: z.enum(["NOT_FOUND", "PENDING", "DONE", "FAILED", "INVALID"]),
    substatus: z.string().optional(),
    substatusMessage: z.string().optional(),
    sendingTxHash: z.string().optional(),
    receivingTxHash: z.string().optional(),
  })
  .strict();

export const schemas: Record<string, z.ZodType> = {
  "bridge-quote-output": bridgeQuoteOutput,
  "bridge-execute-output": bridgeExecuteOutput,
  "bridge-status-output": bridgeStatusOutput,
};
