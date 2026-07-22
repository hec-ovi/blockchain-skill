import { join } from "node:path";
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { entropyToMnemonic, generateMnemonic, mnemonicToEntropy, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { CodedError, run, type Envelope } from "../../core/src/envelope.ts";
import { walletHome } from "../../core/src/home.ts";
import { encryptToV3, decryptFromV3, SCRYPT_DEFAULT, type KeystoreV3, type ScryptParams } from "./keystore.ts";
import {
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
