import { z } from "zod";

const walletName = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const btcNetwork = z.enum(["bitcoin", "signet", "testnet"]);
const btcAddressType = z.enum(["p2tr", "p2wpkh"]);

export const createWalletInput = z
  .object({
    name: walletName,
    passphrase: z.string().min(8),
    words: z.union([z.literal(12), z.literal(24)]).optional(),
  })
  .strict();

export const importWalletInput = createWalletInput.safeExtend({ mnemonic: z.string().min(1) });

export const walletCreatedOutput = z
  .object({
    name: walletName,
    file: z.string(),
    mnemonic: z.string(),
    warning: z.string(),
    evmAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    btcAddress: z.string().min(14),
  })
  .strict();

export const walletListOutput = z.array(
  z.object({ name: walletName, file: z.string(), createdAt: z.string() }).strict(),
);

export const addressQueryInput = z
  .object({
    name: walletName,
    passphrase: z.string(),
    family: z.enum(["evm", "btc"]),
    start: z.number().int().min(0).optional(),
    count: z.number().int().min(1).max(100).optional(),
    network: btcNetwork.optional(),
    addressType: btcAddressType.optional(),
  })
  .strict();

export const addressListOutput = z.array(
  z.union([
    z.object({ family: z.literal("evm"), index: z.number().int(), path: z.string(), address: z.string() }).strict(),
    z
      .object({
        family: z.literal("btc"),
        index: z.number().int(),
        path: z.string(),
        address: z.string(),
        network: btcNetwork,
        addressType: btcAddressType,
      })
      .strict(),
  ]),
);

export const schemas: Record<string, z.ZodType> = {
  "create-wallet-input": createWalletInput,
  "import-wallet-input": importWalletInput,
  "wallet-created-output": walletCreatedOutput,
  "wallet-list-output": walletListOutput,
  "address-query-input": addressQueryInput,
  "address-list-output": addressListOutput,
};
