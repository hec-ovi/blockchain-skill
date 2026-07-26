import { join } from "node:path";
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, generateMnemonic, mnemonicToEntropy, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { CodedError, run, type Envelope } from "../../core/src/envelope.ts";
import { walletHome } from "../../core/src/home.ts";
import { encryptToV3, decryptFromV3, SCRYPT_DEFAULT, type KeystoreV3, type ScryptParams } from "./keystore.ts";
import {
  btcPrivateKey,
  deriveBtcAddress,
  deriveEvmAddress,
  type BtcAddressType,
  type BtcNetworkName,
  type DerivedBtc,
  type DerivedEvm,
} from "./derive.ts";

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const LAYER = { layer: "keys", backend: "scure" };

/** Optional KDF-cost override (power of two, >= 1024); default stays the geth-standard 262144. */
function envScrypt(): ScryptParams | undefined {
  const n = Number(process.env["AGENT_WALLET_SCRYPT_N"] ?? "");
  if (!Number.isInteger(n) || n < 1024 || (n & (n - 1)) !== 0) return undefined;
  return { n, p: 1, r: 8 };
}

function keystoreDir(): string {
  const dir = join(walletHome(), "keystore");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function fileFor(name: string): string {
  if (!NAME_RE.test(name)) {
    throw new CodedError("WALLET_NAME_INVALID", `"${name}" must match ${NAME_RE}`, "Use lowercase letters, digits and hyphens, e.g. main or trading-bot");
  }
  return join(keystoreDir(), `${name}.json`);
}

function readKeystore(name: string): KeystoreV3 {
  const file = fileFor(name);
  if (!existsSync(file)) {
    throw new CodedError("WALLET_NOT_FOUND", `no wallet named "${name}"`, "Run agent-wallet wallet-list to see existing wallets, or wallet-create to make one");
  }
  return JSON.parse(readFileSync(file, "utf8")) as KeystoreV3;
}

/** Decrypt and return the mnemonic. Internal fuel for sign/send layers; never envelope this out. */
export async function unlockMnemonic(name: string, passphrase: string): Promise<string> {
  try {
    return entropyToMnemonic(await decryptFromV3(readKeystore(name), passphrase), wordlist);
  } catch (e) {
    if (e instanceof CodedError) {
      if (e.code === "KEYSTORE_MAC_MISMATCH") {
        throw new CodedError("PASSPHRASE_WRONG", `cannot unlock wallet "${name}"`, "Check AGENT_WALLET_PASSPHRASE or the --passphrase value");
      }
      throw e;
    }
    throw new CodedError("KEYSTORE_UNSUPPORTED", String(e instanceof Error ? e.message : e));
  }
}

export interface WalletCreated {
  name: string;
  file: string;
  mnemonic: string;
  warning: string;
  evmAddress: string;
  btcAddress: string;
}

interface CreateOpts {
  name: string;
  passphrase: string;
  words?: 12 | 24;
  mnemonic?: string;
  scrypt?: ScryptParams;
}

async function writeWallet(opts: CreateOpts): Promise<WalletCreated> {
  const file = fileFor(opts.name);
  if (existsSync(file)) {
    throw new CodedError("WALLET_EXISTS", `wallet "${opts.name}" already exists`, "Pick another name or delete the old keystore file first");
  }
  if (opts.passphrase.length < 8) {
    throw new CodedError("PASSPHRASE_TOO_SHORT", "passphrase must be at least 8 characters");
  }
  const mnemonic = opts.mnemonic ?? generateMnemonic(wordlist, opts.words === 24 ? 256 : 128);
  if (!validateMnemonic(mnemonic, wordlist)) {
    throw new CodedError("MNEMONIC_INVALID", "not a valid BIP-39 english mnemonic", "Check word count (12 or 24) and spelling; words must come from the BIP-39 english wordlist");
  }
  const store = await encryptToV3(mnemonicToEntropy(mnemonic, wordlist), opts.passphrase, opts.scrypt ?? envScrypt() ?? SCRYPT_DEFAULT);
  writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  return {
    name: opts.name,
    file,
    mnemonic,
    warning: "Back up this mnemonic now; it is shown only once and the keystore cannot recover it without the passphrase.",
    evmAddress: deriveEvmAddress(mnemonic, 0).address,
    btcAddress: deriveBtcAddress(mnemonic, 0, "bitcoin", "p2tr").address,
  };
}

export function createWallet(opts: Omit<CreateOpts, "mnemonic">): Promise<Envelope<WalletCreated>> {
  return run(LAYER, () => writeWallet(opts));
}

export function importWallet(opts: CreateOpts & { mnemonic: string }): Promise<Envelope<WalletCreated>> {
  return run(LAYER, () => writeWallet(opts));
}

export interface WalletInfo {
  name: string;
  file: string;
  createdAt: string;
}

export function listWallets(): Promise<Envelope<WalletInfo[]>> {
  return run(LAYER, () =>
    readdirSync(keystoreDir())
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => {
        const name = f.slice(0, -5);
        const store = readKeystore(name);
        return { name, file: join(keystoreDir(), f), createdAt: store.xAgentWallet?.createdAt ?? "unknown" };
      }),
  );
}

export interface AddressQuery {
  name: string;
  passphrase: string;
  family: "evm" | "btc";
  start?: number;
  count?: number;
  network?: BtcNetworkName;
  addressType?: BtcAddressType;
}

export function getAddresses(q: AddressQuery): Promise<Envelope<Array<DerivedEvm | DerivedBtc>>> {
  return run(LAYER, async () => {
    const start = q.start ?? 0;
    const count = q.count ?? 1;
    if (start < 0 || count < 1 || count > 100) {
      throw new CodedError("RANGE_INVALID", "start must be >= 0 and count between 1 and 100");
    }
    const mnemonic = await unlockMnemonic(q.name, q.passphrase);
    return Array.from({ length: count }, (_, i) =>
      q.family === "evm"
        ? deriveEvmAddress(mnemonic, start + i)
        : deriveBtcAddress(mnemonic, start + i, q.network ?? "bitcoin", q.addressType ?? "p2tr"),
    );
  });
}

export interface ExportQuery {
  name: string;
  passphrase: string;
  family: "evm" | "btc";
  index?: number;
  network?: BtcNetworkName;
  addressType?: BtcAddressType;
  /** If set, secrets are written here (mode 0600) and omitted from the envelope. */
  outFile?: string;
  includeMnemonic?: boolean;
}

export interface WalletExport {
  name: string;
  family: "evm" | "btc";
  index: number;
  path: string;
  address: string;
  /** Present only when not writing to outFile (or always inside the file). */
  privateKey?: string;
  network?: BtcNetworkName;
  addressType?: BtcAddressType;
  mnemonic?: string;
  /** Absolute path when secrets were written to disk. */
  file?: string;
  warning: string;
}

function toHex(bytes: Uint8Array): string {
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

/**
 * Export a derived account's address + private key (and optionally the mnemonic).
 * Prefer --out so secrets land in a 0600 file instead of stdout/chat.
 */
export function exportWallet(q: ExportQuery): Promise<Envelope<WalletExport>> {
  return run(LAYER, async () => {
    const index = q.index ?? 0;
    if (index < 0 || index > 1000) {
      throw new CodedError("RANGE_INVALID", "index must be between 0 and 1000");
    }
    const mnemonic = await unlockMnemonic(q.name, q.passphrase);
    const warning =
      "SECRET material. Anyone with this private key (or mnemonic) controls the funds. Store offline; never commit or paste into untrusted chat.";

    let payload: WalletExport;
    if (q.family === "evm") {
      const derived = deriveEvmAddress(mnemonic, index);
      const path = derived.path;
      const node = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic)).derive(path);
      if (!node.privateKey) throw new CodedError("KEY_DERIVE_FAILED", "no private key at EVM path");
      payload = {
        name: q.name,
        family: "evm",
        index,
        path,
        address: derived.address,
        privateKey: toHex(node.privateKey),
        warning,
        ...(q.includeMnemonic ? { mnemonic } : {}),
      };
    } else {
      const network = q.network ?? "bitcoin";
      const addressType = q.addressType ?? "p2tr";
      const derived = deriveBtcAddress(mnemonic, index, network, addressType);
      const pk = btcPrivateKey(mnemonic, index, network, addressType);
      payload = {
        name: q.name,
        family: "btc",
        index,
        path: derived.path,
        address: derived.address,
        privateKey: toHex(pk),
        network,
        addressType,
        warning,
        ...(q.includeMnemonic ? { mnemonic } : {}),
      };
    }

    if (q.outFile) {
      const abs = q.outFile.startsWith("/") ? q.outFile : join(process.cwd(), q.outFile);
      writeFileSync(abs, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
      return {
        name: payload.name,
        family: payload.family,
        index: payload.index,
        path: payload.path,
        address: payload.address,
        warning: payload.warning,
        file: abs,
        ...(payload.network !== undefined && { network: payload.network }),
        ...(payload.addressType !== undefined && { addressType: payload.addressType }),
      };
    }

    return payload;
  });
}
