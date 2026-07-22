import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encryptToV3, decryptFromV3 } from "../src/keystore.ts";
import { deriveBtcAddress, deriveEvmAddress } from "../src/derive.ts";
import { createWallet, getAddresses, importWallet, listWallets, unlockMnemonic } from "../src/wallet.ts";
import { addressListOutput, walletCreatedOutput, walletListOutput } from "../src/contract.ts";
import { envelopeShape } from "../../core/src/envelope.ts";

const FAST = { n: 1024, p: 1, r: 8 };
// The all-abandon BIP-39 test mnemonic with official BIP-86 vectors, and the anvil dev mnemonic.
const BIP86_MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const ANVIL_MNEMONIC = "test test test test test test test test test test test junk";

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "agent-wallet-keys-"));
  process.env["AGENT_WALLET_HOME"] = home;
});
afterEach(() => {
  delete process.env["AGENT_WALLET_HOME"];
  rmSync(home, { recursive: true, force: true });
});

describe("keystore v3", () => {
  it("round-trips a secret and rejects a wrong passphrase", async () => {
    const secret = new Uint8Array(16).fill(7);
    const store = await encryptToV3(secret, "correct horse", FAST);
    expect(store.version).toBe(3);
    expect(store.crypto.kdfparams.n).toBe(1024);
    expect(await decryptFromV3(store, "correct horse")).toEqual(secret);
    await expect(decryptFromV3(store, "wrong")).rejects.toThrowError(/wrong passphrase or corrupted/);
  });

  it("rejects tampered ciphertext (MAC check)", async () => {
    const store = await encryptToV3(new Uint8Array(16), "correct horse", FAST);
    store.crypto.ciphertext = store.crypto.ciphertext.replace(/^../, "ff");
    await expect(decryptFromV3(store, "correct horse")).rejects.toThrowError(/wrong passphrase or corrupted/);
  });
});

describe("derivation vectors", () => {
  it("EVM index 0 of the anvil mnemonic is anvil account 0", () => {
    expect(deriveEvmAddress(ANVIL_MNEMONIC, 0).address).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
  });

  it("BTC taproot matches the official BIP-86 vectors (index 0 and 1)", () => {
    const a0 = deriveBtcAddress(BIP86_MNEMONIC, 0, "bitcoin", "p2tr");
    expect(a0.address).toBe("bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr");
    expect(a0.path).toBe("m/86'/0'/0'/0/0");
    expect(deriveBtcAddress(BIP86_MNEMONIC, 1, "bitcoin", "p2tr").address).toBe(
      "bc1p4qhjn9zdvkux4e44uhx8tc55attvtyu358kutcqkudyccelu0was9fqzwh",
    );
  });

  it("BTC p2wpkh matches the official BIP-84 vector (index 0)", () => {
    const a = deriveBtcAddress(BIP86_MNEMONIC, 0, "bitcoin", "p2wpkh");
    expect(a.address).toBe("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu");
    expect(a.path).toBe("m/84'/0'/0'/0/0");
  });

  it("signet and regtest use testnet coin type and their own prefixes", () => {
    expect(deriveBtcAddress(BIP86_MNEMONIC, 0, "signet", "p2tr").address.startsWith("tb1p")).toBe(true);
    expect(deriveBtcAddress(BIP86_MNEMONIC, 0, "regtest", "p2tr").address.startsWith("bcrt1p")).toBe(true);
    expect(deriveBtcAddress(BIP86_MNEMONIC, 0, "signet", "p2tr").path).toBe("m/86'/1'/0'/0/0");
  });
});

describe("wallet end to end", () => {
  it("creates, lists, unlocks and derives; keystore file is 0600", async () => {
    const created = await createWallet({ name: "main", passphrase: "hunter22hunter", scrypt: FAST });
    expect(envelopeShape.safeParse(created).success).toBe(true);
    expect(created.ok).toBe(true);
    const data = walletCreatedOutput.parse(created.data);
    expect(data.mnemonic.split(" ")).toHaveLength(12);
    expect(statSync(data.file).mode & 0o777).toBe(0o600);
    expect(readFileSync(data.file, "utf8")).not.toContain(data.mnemonic.split(" ")[0]);

    const listed = await listWallets();
    expect(walletListOutput.parse(listed.data)).toHaveLength(1);

    expect(await unlockMnemonic("main", "hunter22hunter")).toBe(data.mnemonic);

    const addrs = await getAddresses({ name: "main", passphrase: "hunter22hunter", family: "evm", count: 3 });
    const list = addressListOutput.parse(addrs.data);
    expect(list).toHaveLength(3);
    expect(list[0]?.address).toBe(data.evmAddress);
  });

  it("imports a known mnemonic and derives the expected addresses", async () => {
    const imported = await importWallet({ name: "anvil", passphrase: "hunter22hunter", mnemonic: ANVIL_MNEMONIC, scrypt: FAST });
    expect(imported.ok).toBe(true);
    const btc = await getAddresses({ name: "anvil", passphrase: "hunter22hunter", family: "btc", network: "regtest" });
    expect(addressListOutput.parse(btc.data)[0]?.address.startsWith("bcrt1p")).toBe(true);
  });

  it("fails closed: duplicate name, bad mnemonic, wrong passphrase, bad name", async () => {
    await createWallet({ name: "dup", passphrase: "hunter22hunter", scrypt: FAST });
    expect((await createWallet({ name: "dup", passphrase: "hunter22hunter", scrypt: FAST })).error?.code).toBe("WALLET_EXISTS");
    expect((await importWallet({ name: "bad", passphrase: "hunter22hunter", mnemonic: "not a mnemonic", scrypt: FAST })).error?.code).toBe("MNEMONIC_INVALID");
    expect((await getAddresses({ name: "dup", passphrase: "nope-nope", family: "evm" })).error?.code).toBe("PASSPHRASE_WRONG");
    expect((await getAddresses({ name: "missing", passphrase: "x", family: "evm" })).error?.code).toBe("WALLET_NOT_FOUND");
    expect((await createWallet({ name: "Bad/Name", passphrase: "hunter22hunter", scrypt: FAST })).error?.code).toBe("WALLET_NAME_INVALID");
    expect((await createWallet({ name: "shortpw", passphrase: "short", scrypt: FAST })).error?.code).toBe("PASSPHRASE_TOO_SHORT");
  });

  it("every failure is still a schema-valid envelope with a hint where promised", async () => {
    const env = await getAddresses({ name: "missing", passphrase: "x", family: "evm" });
    expect(envelopeShape.safeParse(env).success).toBe(true);
    expect(env.error?.hint).toContain("wallet-list");
  });
});
