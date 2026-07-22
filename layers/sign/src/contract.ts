import { z } from "zod";

const digits = z.string().regex(/^\d+$/);
const hex = z.string().regex(/^0x[0-9a-fA-F]*$/);

export const evmSignInput = z
  .object({
    wallet: z.string(),
    passphrase: z.string(),
    index: z.number().int().min(0).optional(),
    chainId: z.number().int().positive(),
    to: z.string().optional(),
    valueWei: digits.optional(),
    data: hex.optional(),
    nonce: z.number().int().min(0),
    gasLimit: digits,
    maxFeePerGas: digits,
    maxPriorityFeePerGas: digits,
  })
  .strict();

export const evmSignedOutput = z
  .object({
    family: z.literal("evm"),
    rawTx: hex,
    hash: z.string().regex(/^0x[0-9a-f]{64}$/),
    from: z.string(),
    chainId: z.number().int(),
    nonce: z.number().int(),
  })
  .strict();

export const evmSignatureOutput = z.object({ family: z.literal("evm"), signature: hex, address: z.string() }).strict();

export const btcSignInput = z
  .object({
    wallet: z.string(),
    passphrase: z.string(),
    index: z.number().int().min(0).optional(),
    network: z.enum(["bitcoin", "signet", "testnet", "regtest"]),
    addressType: z.enum(["p2tr", "p2wpkh"]).optional(),
    to: z.string(),
    amountSats: z.union([digits, z.literal("all")]),
    feeRateSatVb: z.number().min(1).max(5000),
    utxos: z.array(
      z
        .object({ txid: z.string().regex(/^[0-9a-f]{64}$/i), vout: z.number().int().min(0), valueSats: digits, confirmed: z.boolean() })
        .loose(),
    ),
  })
  .strict();

export const btcSignedOutput = z
  .object({
    family: z.literal("btc"),
    txHex: z.string().regex(/^[0-9a-f]+$/i),
    txid: z.string().regex(/^[0-9a-f]{64}$/i),
    vsize: z.number().int().positive(),
    feeSats: digits,
    changeSats: digits,
    inputs: z.number().int().positive(),
    outputs: z.number().int().positive(),
    from: z.string(),
  })
  .strict();

export const schemas: Record<string, z.ZodType> = {
  "evm-sign-input": evmSignInput,
  "evm-signed-output": evmSignedOutput,
  "evm-signature-output": evmSignatureOutput,
  "btc-sign-input": btcSignInput,
  "btc-signed-output": btcSignedOutput,
};
