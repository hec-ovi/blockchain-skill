import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  decodeErrorResult,
  decodeEventLog,
  decodeFunctionResult,
  encodeDeployData,
  encodeFunctionData,
  getAbiItem,
  parseEther,
  parseGwei,
  type Abi,
} from "viem";
import { CodedError } from "../../core/src/envelope.ts";
import { compileSources, type CompiledContract } from "../../contracts/src/compile.ts";
import { Sandbox } from "./evm.ts";
import { planInput, type InvariantResult, type LogEntry, type Plan, type RunOutput, type StepResult } from "./contract.ts";

/** EIP-170: deployed runtime code above this is rejected by every mainnet-rules chain. */
const RUNTIME_CODE_LIMIT = 24_576;

const PANIC_REASONS: Record<string, string> = {
  "0x00": "generic compiler panic",
  "0x01": "assert(false)",
  "0x11": "arithmetic overflow or underflow",
  "0x12": "division or modulo by zero",
  "0x21": "invalid enum conversion",
  "0x22": "malformed storage byte array",
  "0x31": "pop on empty array",
  "0x32": "array index out of bounds",
  "0x41": "out of memory",
  "0x51": "call to an uninitialized internal function",
};

/** `"1 ether"`, `"0.05 ether"`, `"3 gwei"`, or a bare wei integer. */
export function parseAmount(raw: string, where: string): bigint {
  const text = raw.trim();
  const unit = /^(-?[0-9._]+)\s*(wei|gwei|ether|eth)$/i.exec(text);
  if (unit) {
    const [, amount = "", denom = ""] = unit;
    const clean = amount.replace(/_/g, "");
    const d = denom.toLowerCase();
    if (d === "wei") return BigInt(clean);
    if (d === "gwei") return parseGwei(clean);
    return parseEther(clean);
  }
  if (/^-?\d+$/.test(text.replace(/_/g, ""))) return BigInt(text.replace(/_/g, ""));
  throw new CodedError(
    "AMOUNT_INVALID",
    `cannot read the amount ${raw} at ${where}`,
    'Use wei as a plain integer ("1000000000000000000") or a unit suffix ("1 ether", "0.05 ether", "3 gwei")',
  );
}

/** Stable string form so results compare and read the same every run. */
function stringify(value: unknown): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return value.startsWith("0x") ? value.toLowerCase() : value;
  if (Array.isArray(value)) return `[${value.map(stringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .map(([k, v]) => `${k}:${stringify(v)}`)
      .join(",")}}`;
  }
  return String(value);
}

interface Refs {
  account(name: string): `0x${string}`;
  contract(name: string): `0x${string}`;
}

/** `@alice` -> account address, `$vault` -> address of a contract deployed earlier. */
function resolveArg(arg: unknown, refs: Refs): unknown {
  if (Array.isArray(arg)) return arg.map((a) => resolveArg(a, refs));
  if (typeof arg !== "string") return arg;
  if (arg.startsWith("@")) return refs.account(arg.slice(1));
  if (arg.startsWith("$")) return refs.contract(arg.slice(1));
  return arg;
}

/** Coerce a decimal string into a bigint for uint/int ABI slots; viem rejects strings there. */
function coerceForAbi(args: unknown[], abi: Abi, fn: string | null): unknown[] {
  const item = fn === null ? abi.find((i) => i.type === "constructor") : getAbiItem({ abi, name: fn });
  const inputs = item && "inputs" in item ? item.inputs : undefined;
  if (!inputs) return args;
  return args.map((arg, i) => {
    const type = inputs[i]?.type ?? "";
    if (/^u?int/.test(type) && typeof arg === "string" && /^-?\d+$/.test(arg)) return BigInt(arg);
    if (/^u?int/.test(type) && typeof arg === "number") return BigInt(arg);
    return arg;
  });
}

/** Human-readable revert: Error(string), Panic(code), a custom error from any known ABI, or bare. */
function describeRevert(data: `0x${string}`, abis: Abi[], fallback: string | undefined): string {
  if (data === "0x" || data.length < 10) return fallback ?? "reverted with no reason";
  if (data.startsWith("0x4e487b71")) {
    const code = `0x${data.slice(-2)}`;
    return `Panic(${code}) ${PANIC_REASONS[code] ?? "unknown panic"}`;
  }
  for (const abi of abis) {
    try {
      const decoded = decodeErrorResult({ abi, data });
      const args = (decoded.args ?? []).map(stringify).join(", ");
      return `${decoded.errorName}(${args})`;
    } catch {
      /* not this abi */
    }
  }
  return `reverted with unrecognized data ${data.slice(0, 42)}`;
}

function decodeLogs(logs: Array<{ address: `0x${string}`; topics: `0x${string}`[]; data: `0x${string}` }>, abis: Abi[]): LogEntry[] {
  return logs.map<LogEntry>((log) => {
    for (const abi of abis) {
      try {
        const decoded = decodeEventLog({ abi, topics: log.topics as [`0x${string}`, ...`0x${string}`[]], data: log.data });
        const args: Record<string, string> = {};
        for (const [k, v] of Object.entries((decoded.args ?? {}) as Record<string, unknown>)) args[k] = stringify(v);
        return { address: log.address, event: String(decoded.eventName), args };
      } catch {
        /* not this abi */
      }
    }
    return { address: log.address, event: "unknown", args: { topic0: log.topics[0] ?? "0x", data: log.data } };
  });
}

function readSources(plan: Plan, baseDir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of plan.sources) {
    if (s.content !== undefined) {
      out[s.path] = s.content;
      continue;
    }
    const file = resolve(baseDir, s.file!);
    try {
      out[s.path] = readFileSync(file, "utf8");
    } catch {
      throw new CodedError("SOURCE_UNREADABLE", `cannot read ${file}`, "Check the plan's sources[].file path (relative to the plan file)");
    }
  }
  return out;
}

function pickContract(compiled: CompiledContract[], name: string): CompiledContract {
  const hit = compiled.find((c) => c.contractName === name);
  if (!hit) {
    throw new CodedError(
      "CONTRACT_NOT_FOUND",
      `no compiled contract named ${name}`,
      `Compiled: ${compiled.map((c) => c.contractName).join(", ") || "(none)"}`,
    );
  }
  return hit;
}

export interface RunPlanOptions {
  /** Directory that `sources[].file` paths resolve against. */
  baseDir?: string;
}

/**
 * Compile the plan's sources, deploy them into a fresh in-memory EVM, run every
 * step, then check the invariants. Deterministic and offline: same plan, same
 * addresses, same gas. `pass` is true only when nothing deviated.
 */
export async function runPlan(raw: unknown, opts: RunPlanOptions = {}): Promise<RunOutput> {
  const parsed = planInput.safeParse(raw);
  if (!parsed.success) {
    throw new CodedError(
      "PLAN_INVALID",
      "the sandbox plan does not match the schema",
      parsed.error.issues.map((i) => `${i.path.join(".") || "$"}: ${i.message}`).join("; ").slice(0, 800),
    );
  }
  const plan = parsed.data;
  const baseDir = opts.baseDir ?? process.cwd();

  const sources = readSources(plan, baseDir);
  // Compile for the same fork the sandbox executes, or a contract built for the
  // solc default (osaka) hits an invalid opcode on an older VM.
  const { contracts: compiled, warnings, compilerVersion } = compileSources(sources, {
    optimize: plan.optimize,
    evmVersion: plan.hardfork,
  });

  const sandbox = await Sandbox.create(plan.hardfork, BigInt(plan.gasLimit));
  const accountBalances: Record<string, string> = { deployer: "100 ether", ...plan.accounts };
  const accountAddresses: Record<string, `0x${string}`> = {};
  for (const [name, amount] of Object.entries(accountBalances)) {
    const acct = await sandbox.fund(name, parseAmount(amount, `accounts.${name}`));
    accountAddresses[name] = acct.address.toString() as `0x${string}`;
  }

  const deployedAddresses: Record<string, `0x${string}`> = {};
  const abiOf: Record<string, Abi> = {};
  const refs: Refs = {
    account: (name) => {
      const hit = accountAddresses[name];
      if (!hit) throw new CodedError("ACCOUNT_UNKNOWN", `no sandbox account named ${name}`, `Known: ${Object.keys(accountAddresses).join(", ")}`);
      return hit;
    },
    contract: (name) => {
      const hit = deployedAddresses[name];
      if (!hit) {
        throw new CodedError(
          "REF_UNKNOWN",
          `$${name} is not deployed yet`,
          `Deploy it earlier in the plan. Deployed so far: ${Object.keys(deployedAddresses).join(", ") || "(none)"}`,
        );
      }
      return hit;
    },
  };

  const failures: string[] = [];
  const output: RunOutput = {
    hardfork: sandbox.hardfork,
    compilerVersion,
    accounts: accountAddresses,
    deployed: [],
    steps: [],
    invariants: [],
    balances: {},
    pass: false,
    failures,
    warnings,
  };

  for (const entry of plan.deploy) {
    const artifact = pickContract(compiled, entry.contract);
    const abi = artifact.abi as Abi;
    const args = coerceForAbi(entry.args.map((a) => resolveArg(a, refs)), abi, null);
    const data = encodeDeployData({ abi, bytecode: artifact.bytecode as `0x${string}`, args }) as `0x${string}`;
    const res = await sandbox.send(entry.from, undefined, data, parseAmount(entry.value, `deploy.${entry.as}.value`));
    if (!res.ok || !res.createdAddress) {
      throw new CodedError(
        "DEPLOY_FAILED",
        `deploying ${entry.contract} as $${entry.as} reverted`,
        describeRevert(res.returnValue, Object.values(abiOf).concat(abi), res.error),
      );
    }
    deployedAddresses[entry.as] = res.createdAddress;
    abiOf[entry.as] = abi;
    const runtimeSizeBytes = await sandbox.codeSizeOf(res.createdAddress);
    const overSizeLimit = runtimeSizeBytes > RUNTIME_CODE_LIMIT;
    if (overSizeLimit) failures.push(`$${entry.as} runtime code is ${runtimeSizeBytes} bytes, over the EIP-170 limit of ${RUNTIME_CODE_LIMIT}`);
    output.deployed.push({
      as: entry.as,
      contract: entry.contract,
      address: res.createdAddress,
      gasUsed: res.gasUsed.toString(),
      runtimeSizeBytes,
      overSizeLimit,
    });
  }

  const knownAbis = () => Object.values(abiOf);

  for (const [index, step] of plan.steps.entries()) {
    const to = refs.contract(step.to);
    const abi = abiOf[step.to]!;
    const item = getAbiItem({ abi, name: step.fn });
    if (!item || item.type !== "function") {
      throw new CodedError(
        "FUNCTION_NOT_FOUND",
        `$${step.to} has no function ${step.fn}`,
        `Available: ${abi.filter((i) => i.type === "function").map((i) => (i as { name: string }).name).join(", ")}`,
      );
    }
    const readOnly = item.stateMutability === "view" || item.stateMutability === "pure";
    const kind = step.kind === "auto" ? (readOnly ? "call" : "send") : step.kind;
    const args = coerceForAbi(step.args.map((a) => resolveArg(a, refs)), abi, step.fn);
    const data = encodeFunctionData({ abi, functionName: step.fn, args }) as `0x${string}`;
    const value = parseAmount(step.value, `steps[${index}].value`);

    const res =
      kind === "call"
        ? await sandbox.call(step.from, to, data)
        : await sandbox.send(step.from, to, data, value);

    const name = step.name ?? `${step.from} -> ${step.to}.${step.fn}`;
    const result: StepResult = {
      index,
      name,
      kind,
      from: refs.account(step.from),
      to,
      fn: step.fn,
      ok: res.ok,
      pass: true,
      gasUsed: res.gasUsed.toString(),
      logs: decodeLogs(res.logs, knownAbis()),
    };

    if (res.ok) {
      try {
        const decoded = decodeFunctionResult({ abi, functionName: step.fn, data: res.returnValue });
        if (decoded !== undefined) result.returns = stringify(decoded);
      } catch {
        /* void function */
      }
    } else {
      result.revert = describeRevert(res.returnValue, knownAbis(), res.error);
    }

    if (step.expect === "ok" && !res.ok) {
      result.pass = false;
      failures.push(`step ${index} (${name}) expected success, reverted: ${result.revert}`);
    } else if (step.expect === "revert" && res.ok) {
      result.pass = false;
      failures.push(`step ${index} (${name}) expected a revert, it succeeded`);
    } else if (step.expect === "revert" && step.revert && !(result.revert ?? "").includes(step.revert)) {
      result.pass = false;
      failures.push(`step ${index} (${name}) expected revert ${step.revert}, got: ${result.revert}`);
    } else if (step.returns !== undefined && result.returns !== stringify(step.returns)) {
      result.pass = false;
      failures.push(`step ${index} (${name}) expected return ${step.returns}, got ${result.returns ?? "(nothing)"}`);
    }
    output.steps.push(result);
  }

  for (const inv of plan.invariants) {
    let actual: string;
    if (inv.balanceOf !== undefined) {
      const target = deployedAddresses[inv.balanceOf] ?? accountAddresses[inv.balanceOf];
      if (!target) {
        throw new CodedError("REF_UNKNOWN", `invariant ${inv.name}: no account or contract named ${inv.balanceOf}`, "Name one from accounts or deploy");
      }
      actual = (await sandbox.balanceOf(target)).toString();
    } else {
      if (inv.to === undefined) {
        throw new CodedError("PLAN_INVALID", `invariant ${inv.name} has fn but no to`, "Name the deployed contract with to");
      }
      const to = refs.contract(inv.to);
      const abi = abiOf[inv.to]!;
      const args = coerceForAbi(inv.args.map((a) => resolveArg(a, refs)), abi, inv.fn!);
      const data = encodeFunctionData({ abi, functionName: inv.fn!, args }) as `0x${string}`;
      const res = await sandbox.call("deployer", to, data);
      if (!res.ok) {
        actual = `reverted: ${describeRevert(res.returnValue, knownAbis(), res.error)}`;
      } else {
        actual = stringify(decodeFunctionResult({ abi, functionName: inv.fn!, data: res.returnValue }));
      }
    }

    const expected = /^\d+\s*(wei|gwei|ether|eth)$/i.test(inv.value.trim())
      ? parseAmount(inv.value, `invariants.${inv.name}`).toString()
      : stringify(inv.value);
    const numeric = /^-?\d+$/.test(actual) && /^-?\d+$/.test(expected);
    const [a, b] = numeric ? [BigInt(actual), BigInt(expected)] : [actual, expected];
    const held =
      inv.op === "eq" ? a === b
      : inv.op === "ne" ? a !== b
      : numeric && inv.op === "lt" ? (a as bigint) < (b as bigint)
      : numeric && inv.op === "lte" ? (a as bigint) <= (b as bigint)
      : numeric && inv.op === "gt" ? (a as bigint) > (b as bigint)
      : numeric && inv.op === "gte" ? (a as bigint) >= (b as bigint)
      : false;

    const invResult: InvariantResult = { name: inv.name, held, expected, actual, op: inv.op };
    if (!held) failures.push(`invariant ${inv.name} broke: expected ${inv.op} ${expected}, got ${actual}`);
    output.invariants.push(invResult);
  }

  for (const [name, address] of Object.entries(accountAddresses)) output.balances[`@${name}`] = (await sandbox.balanceOf(address)).toString();
  for (const [name, address] of Object.entries(deployedAddresses)) output.balances[`$${name}`] = (await sandbox.balanceOf(address)).toString();

  output.pass = failures.length === 0;
  return output;
}
