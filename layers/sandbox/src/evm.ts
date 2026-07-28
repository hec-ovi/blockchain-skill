import { createBlock, type Block } from "@ethereumjs/block";
import { Common, Hardfork, Mainnet } from "@ethereumjs/common";
import { createLegacyTx } from "@ethereumjs/tx";
import { bytesToHex, createAccount, createAddressFromPrivateKey, createAddressFromString, hexToBytes, type Address } from "@ethereumjs/util";
import { createVM, runTx, type VM } from "@ethereumjs/vm";
import { keccak256, toHex } from "viem";
import { CodedError } from "../../core/src/envelope.ts";

/** Deterministic key material: the same plan always yields the same addresses. */
function keyFor(name: string): Uint8Array {
  return hexToBytes(keccak256(toHex(`agent-wallet/sandbox/${name}`)));
}

export interface Account {
  name: string;
  key: Uint8Array;
  address: Address;
}

export interface ExecResult {
  ok: boolean;
  gasUsed: bigint;
  returnValue: `0x${string}`;
  /** Raw EVM error name when the call did not succeed (e.g. "revert", "out of gas"). */
  error?: string;
  logs: Array<{ address: `0x${string}`; topics: `0x${string}`[]; data: `0x${string}` }>;
  createdAddress?: `0x${string}`;
}

const HARDFORK_BY_NAME: Record<string, Hardfork> = {
  london: Hardfork.London,
  paris: Hardfork.Paris,
  shanghai: Hardfork.Shanghai,
  cancun: Hardfork.Cancun,
  prague: Hardfork.Prague,
  osaka: Hardfork.Osaka,
  amsterdam: Hardfork.Amsterdam,
};

/**
 * A single-block, in-process EVM. No node, no network, no funds: state lives in
 * memory for the duration of one run and is discarded. Blocks never advance, so
 * every run of the same plan produces the same gas numbers and addresses.
 */
export class Sandbox {
  private readonly vm: VM;
  readonly hardfork: string;
  private readonly gasLimit: bigint;
  private readonly block: Block;
  private readonly accounts = new Map<string, Account>();
  private readonly nonces = new Map<string, bigint>();

  private constructor(vm: VM, hardfork: string, gasLimit: bigint, block: Block) {
    this.vm = vm;
    this.hardfork = hardfork;
    this.gasLimit = gasLimit;
    this.block = block;
  }

  static async create(hardfork: string, gasLimit: bigint): Promise<Sandbox> {
    const hf = HARDFORK_BY_NAME[hardfork];
    if (!hf) {
      throw new CodedError(
        "HARDFORK_UNKNOWN",
        `unknown hardfork ${hardfork}`,
        `Use one of: ${Object.keys(HARDFORK_BY_NAME).join(", ")}`,
      );
    }
    const common = new Common({ chain: Mainnet, hardfork: hf });
    const vm = await createVM({ common });
    // Zero base fee and zero gas price: gas is still metered and reported, but
    // it is never deducted, so balance assertions in a plan stay exact.
    const block = createBlock({ header: { number: 1n, gasLimit, baseFeePerGas: 0n, timestamp: 1_700_000_000n } }, { common });
    return new Sandbox(vm, hardfork, gasLimit, block);
  }

  /** Create a funded EOA. `balanceWei` is the starting native balance. */
  async fund(name: string, balanceWei: bigint): Promise<Account> {
    const existing = this.accounts.get(name);
    if (existing) return existing;
    const key = keyFor(name);
    const address = createAddressFromPrivateKey(key);
    await this.vm.stateManager.putAccount(address, createAccount({ nonce: 0n, balance: balanceWei }));
    const account: Account = { name, key, address };
    this.accounts.set(name, account);
    this.nonces.set(name, 0n);
    return account;
  }

  account(name: string): Account {
    const found = this.accounts.get(name);
    if (!found) {
      throw new CodedError(
        "ACCOUNT_UNKNOWN",
        `no sandbox account named ${name}`,
        `Declare it under "accounts" in the plan. Known: ${[...this.accounts.keys()].join(", ")}`,
      );
    }
    return found;
  }

  async balanceOf(address: `0x${string}`): Promise<bigint> {
    const acct = await this.vm.stateManager.getAccount(createAddressFromString(address));
    return acct?.balance ?? 0n;
  }

  async codeSizeOf(address: `0x${string}`): Promise<number> {
    const code = await this.vm.stateManager.getCode(createAddressFromString(address));
    return code.length;
  }

  /** A state-changing transaction: nonce advances, state is kept, gas is charged. */
  async send(from: string, to: `0x${string}` | undefined, data: `0x${string}`, value: bigint): Promise<ExecResult> {
    const account = this.account(from);
    const nonce = this.nonces.get(from) ?? 0n;
    const tx = createLegacyTx({
      nonce,
      gasLimit: this.gasLimit,
      gasPrice: 0n,
      value,
      ...(to ? { to: createAddressFromString(to) } : {}),
      data: hexToBytes(data),
    }).sign(account.key);

    const res = await runTx(this.vm, {
      tx,
      block: this.block,
      skipBlockGasLimitValidation: true,
      skipHardForkValidation: true,
      skipBalance: false,
    });
    this.nonces.set(from, nonce + 1n);

    const exec = res.execResult;
    const out: ExecResult = {
      ok: exec.exceptionError === undefined,
      gasUsed: res.totalGasSpent,
      returnValue: bytesToHex(exec.returnValue) as `0x${string}`,
      logs: (exec.logs ?? []).map(([address, topics, data_]) => ({
        address: bytesToHex(address) as `0x${string}`,
        topics: topics.map((t) => bytesToHex(t) as `0x${string}`),
        data: bytesToHex(data_) as `0x${string}`,
      })),
    };
    if (exec.exceptionError !== undefined) out.error = String(exec.exceptionError.error ?? exec.exceptionError);
    if (res.createdAddress) out.createdAddress = res.createdAddress.toString() as `0x${string}`;
    return out;
  }

  /** A read: executed against current state, then discarded. Nothing is committed. */
  async call(from: string, to: `0x${string}`, data: `0x${string}`): Promise<ExecResult> {
    const account = this.account(from);
    await this.vm.stateManager.checkpoint();
    try {
      const res = await this.vm.evm.runCall({
        to: createAddressFromString(to),
        caller: account.address,
        origin: account.address,
        data: hexToBytes(data),
        gasLimit: this.gasLimit,
        value: 0n,
        block: this.block,
      });
      const exec = res.execResult;
      const out: ExecResult = {
        ok: exec.exceptionError === undefined,
        gasUsed: exec.executionGasUsed,
        returnValue: bytesToHex(exec.returnValue) as `0x${string}`,
        logs: [],
      };
      if (exec.exceptionError !== undefined) out.error = String(exec.exceptionError.error ?? exec.exceptionError);
      return out;
    } finally {
      await this.vm.stateManager.revert();
    }
  }
}
