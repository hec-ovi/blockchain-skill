import { z } from "zod";
import { gateConfigSchema, OPERATION_KINDS } from "./policy.ts";

export const gateOperationInput = z
  .object({
    kind: z.enum(OPERATION_KINDS),
    chain: z
      .object({
        family: z.enum(["evm", "btc"]),
        name: z.string(),
        testnet: z.boolean(),
        chainId: z.number().int().optional(),
        network: z.string().optional(),
      })
      .strict(),
    valueBaseUnits: z.string().regex(/^\d+$/).optional(),
  })
  .strict();

export const gateVerdictOutput = z
  .object({
    allowed: z.literal(true),
    kind: z.enum(OPERATION_KINDS),
    chain: z.string(),
    mainnet: z.boolean(),
    policy: z.object({ allowMainnet: z.boolean(), capApplied: z.string().nullable() }).strict(),
  })
  .strict();

export const schemas: Record<string, z.ZodType> = {
  "gate-operation-input": gateOperationInput,
  "gate-verdict-output": gateVerdictOutput,
  "gate-config": gateConfigSchema,
};
