import { z } from "zod";

const digits = z.string().regex(/^\d+$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hex = z.string().regex(/^0x[0-9a-fA-F]*$/);

export const compiledOutput = z.array(
  z
    .object({
      contractName: z.string(),
      abi: z.array(z.unknown()),
      bytecode: hex,
      deployedBytecode: hex,
      compilerVersion: z.string(),
      sourceName: z.string(),
    })
    .strict(),
);

export const deployOutput = z
  .object({
    chain: z.string(),
    chainId: z.number().int().positive(),
    address,
    txHash: z.string().regex(/^0x[0-9a-f]{64}$/i),
    deployer: address,
    contractName: z.string(),
    abi: z.array(z.unknown()),
    compilerVersion: z.string().optional(),
    gasUsed: digits,
    explorer: z.string().optional(),
  })
  .strict();

export const callOutput = z.object({ function: z.string(), result: z.unknown() }).strict();

export const writeOutput = z
  .object({
    function: z.string(),
    hash: z.string().regex(/^0x[0-9a-f]{64}$/i),
    from: address,
    status: z.enum(["broadcast", "confirmed", "reverted"]),
    blockNumber: digits.optional(),
    gasUsed: digits.optional(),
  })
  .strict();

export const verifyOutput = z
  .object({
    address,
    chainId: z.number().int().positive(),
    verifier: z.enum(["sourcify", "blockscout", "etherscan"]),
    verified: z.boolean(),
    detail: z.string(),
  })
  .strict();

export const schemas: Record<string, z.ZodType> = {
  "compiled-output": compiledOutput,
  "deploy-output": deployOutput,
  "call-output": callOutput,
  "write-output": writeOutput,
  "verify-output": verifyOutput,
};
