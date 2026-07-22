import { z } from "zod";

export const contractSourceOutput = z
  .object({
    address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    chainId: z.number().int().positive(),
    verified: z.boolean(),
    source: z.enum(["sourcify", "blockscout", "etherscan", "whatsabi"]),
    name: z.string().optional(),
    abi: z.array(z.unknown()),
    compilerVersion: z.string().optional(),
    isProxy: z.boolean().optional(),
    implementation: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
    files: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export const schemas: Record<string, z.ZodType> = {
  "contract-source-output": contractSourceOutput,
};
