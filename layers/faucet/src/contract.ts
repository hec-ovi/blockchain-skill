import { z } from "zod";

export const faucetInput = z
  .object({
    address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    network: z.enum(["base-sepolia", "base-testnet", "ethereum-sepolia", "sepolia"]),
    token: z.enum(["eth", "usdc", "eurc", "cbbtc"]).optional(),
  })
  .strict();

export const faucetOutput = z
  .object({
    network: z.string(),
    address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    token: z.enum(["eth", "usdc", "eurc", "cbbtc"]),
    transactionHash: z.string().regex(/^0x[0-9a-f]{64}$/i),
    explorer: z.string(),
  })
  .strict();

export const schemas: Record<string, z.ZodType> = {
  "faucet-input": faucetInput,
  "faucet-output": faucetOutput,
};
