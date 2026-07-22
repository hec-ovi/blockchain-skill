import { z } from "zod";

const nativeCurrency = z.object({ name: z.string(), symbol: z.string(), decimals: z.number().int() }).strict();

export const evmChainInfo = z
  .object({
    family: z.literal("evm"),
    chainId: z.number().int().positive(),
    name: z.string().min(1),
    shortName: z.string().optional(),
    rpcUrls: z.array(z.string().regex(/^https?:\/\//)),
    explorers: z.array(z.string()),
    nativeCurrency,
    testnet: z.boolean(),
    source: z.enum(["viem", "registry"]),
  })
  .strict();

export const btcChainInfo = z
  .object({
    family: z.literal("btc"),
    network: z.enum(["bitcoin", "signet", "testnet"]),
    name: z.string().min(1),
    esploraUrls: z.array(z.string()),
    testnet: z.boolean(),
    source: z.literal("builtin"),
  })
  .strict();

export const chainInfoOutput = z.union([evmChainInfo, btcChainInfo]);

export const chainCheckOutput = z
  .object({
    chainId: z.number().int(),
    reportedChainId: z.number().int(),
    match: z.boolean(),
    blockNumber: z.string(),
    latencyMs: z.number().int().nonnegative(),
  })
  .strict();

export const schemas: Record<string, z.ZodType> = {
  "chain-info-output": chainInfoOutput,
  "chain-check-output": chainCheckOutput,
};
