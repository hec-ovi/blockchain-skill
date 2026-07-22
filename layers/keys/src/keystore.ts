import { randomUUID } from "node:crypto";
import { CodedError } from "../../core/src/envelope.ts";
import { scrypt } from "ethereum-cryptography/scrypt.js";
import { encrypt as aesEncrypt, decrypt as aesDecrypt } from "ethereum-cryptography/aes.js";
import { keccak256 } from "ethereum-cryptography/keccak.js";
import { getRandomBytesSync } from "ethereum-cryptography/random.js";
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from "ethereum-cryptography/utils.js";

/**
 * Web3 Secret Storage v3 (scrypt + aes-128-ctr + keccak MAC), the geth/cast
 * interop format. We store BIP-39 entropy as the secret so one file unlocks
 * every chain; `xAgentWallet` marks that so nobody mistakes it for a bare
 * private-key keystore.
 */
export interface KeystoreV3 {
  version: 3;
  id: string;
  crypto: {
    cipher: "aes-128-ctr";
    cipherparams: { iv: string };
    ciphertext: string;
    kdf: "scrypt";
    kdfparams: { dklen: 32; n: number; p: number; r: number; salt: string };
    mac: string;
  };
  xAgentWallet: { secret: "bip39-entropy"; createdAt: string };
}

export interface ScryptParams {
  n: number;
  p: number;
  r: number;
}

/** geth default cost. Tests inject a small n; production callers omit. */
export const SCRYPT_DEFAULT: ScryptParams = { n: 262144, p: 1, r: 8 };

async function deriveKey(passphrase: string, salt: Uint8Array, params: ScryptParams): Promise<Uint8Array> {
  return scrypt(utf8ToBytes(passphrase.normalize("NFKC")), salt, params.n, params.p, params.r, 32);
}

function macOf(derivedKey: Uint8Array, ciphertext: Uint8Array): string {
  return bytesToHex(keccak256(concatBytes(derivedKey.slice(16, 32), ciphertext)));
}

export async function encryptToV3(secret: Uint8Array, passphrase: string, params: ScryptParams = SCRYPT_DEFAULT): Promise<KeystoreV3> {
  const salt = getRandomBytesSync(32);
  const iv = getRandomBytesSync(16);
  const derivedKey = await deriveKey(passphrase, salt, params);
  const ciphertext = await aesEncrypt(secret, derivedKey.slice(0, 16), iv, "aes-128-ctr", false);
  return {
    version: 3,
    id: randomUUID(),
    crypto: {
      cipher: "aes-128-ctr",
      cipherparams: { iv: bytesToHex(iv) },
      ciphertext: bytesToHex(ciphertext),
      kdf: "scrypt",
      kdfparams: { dklen: 32, n: params.n, p: params.p, r: params.r, salt: bytesToHex(salt) },
      mac: macOf(derivedKey, ciphertext),
    },
    xAgentWallet: { secret: "bip39-entropy", createdAt: new Date().toISOString() },
  };
}

export async function decryptFromV3(store: KeystoreV3, passphrase: string): Promise<Uint8Array> {
  const { crypto: c } = store;
  if (store.version !== 3 || c.cipher !== "aes-128-ctr" || c.kdf !== "scrypt") {
    throw new CodedError("KEYSTORE_UNSUPPORTED", "only keystore v3 scrypt aes-128-ctr files are accepted");
  }
  const ciphertext = hexToBytes(c.ciphertext);
  const derivedKey = await deriveKey(passphrase, hexToBytes(c.kdfparams.salt), c.kdfparams);
  if (macOf(derivedKey, ciphertext) !== c.mac) {
    throw new CodedError("KEYSTORE_MAC_MISMATCH", "wrong passphrase or corrupted keystore file");
  }
  return aesDecrypt(ciphertext, derivedKey.slice(0, 16), hexToBytes(c.cipherparams.iv), "aes-128-ctr", false);
}
