import { z } from "zod";

const ident = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
const digits = z.string().regex(/^\d+$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

/** Every hardfork @ethereumjs/vm v10 executes. `osaka` is the solc 0.8.36 default target. */
export const hardforks = z.enum([
  "london",
  "paris",
  "shanghai",
  "cancun",
  "prague",
  "osaka",
  "amsterdam",
]);

/**
 * Argument literal. Addresses may be written as a reference the runner resolves
 * before encoding: `@alice` is an account, `$vault` a contract deployed earlier
 * in this plan. Numbers stay strings so 256-bit values survive JSON.
 */
export const argValue: z.ZodType = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.array(argValue)]),
);

export const sourceEntry = z
  .object({
    path: z.string().min(1),
    content: z.string().optional(),
    file: z.string().optional(),
  })
  .strict()
  .refine((s) => (s.content === undefined) !== (s.file === undefined), {
    message: "give exactly one of content or file",
  });

export const deployEntry = z
  .object({
    as: ident,
    contract: z.string().min(1),
    from: ident.default("deployer"),
    args: z.array(argValue).default([]),
    value: z.string().default("0"),
  })
  .strict();

export const stepEntry = z
  .object({
    name: z.string().optional(),
    to: ident,
    from: ident.default("deployer"),
    fn: z.string().min(1),
    args: z.array(argValue).default([]),
    value: z.string().default("0"),
    /** `call` is a read (no state kept), `send` a transaction. Default follows the ABI mutability. */
    kind: z.enum(["auto", "call", "send"]).default("auto"),
    expect: z.enum(["ok", "revert"]).default("ok"),
    /** Error name or revert string that MUST match when expect=revert. */
    revert: z.string().optional(),
    /** Expected return value of a read, compared as a JSON-ish string. */
    returns: z.string().optional(),
  })
  .strict();

export const invariantEntry = z
  .object({
    name: z.string().min(1),
    /** Either a view call on a deployed contract, or a native balance probe. */
    to: ident.optional(),
    fn: z.string().optional(),
    args: z.array(argValue).default([]),
    balanceOf: ident.optional(),
    op: z.enum(["eq", "ne", "lt", "lte", "gt", "gte"]).default("eq"),
    value: z.string(),
  })
  .strict()
  .refine((i) => (i.balanceOf === undefined) !== (i.fn === undefined), {
    message: "give exactly one of fn (with to) or balanceOf",
  });

export const planInput = z
  .object({
    hardfork: hardforks.default("cancun"),
    /** Named EOAs and their starting balance in ether. `deployer` is always present. */
    accounts: z.record(ident, z.string()).default({}),
    sources: z.array(sourceEntry).min(1),
    deploy: z.array(deployEntry).min(1),
    steps: z.array(stepEntry).default([]),
    invariants: z.array(invariantEntry).default([]),
    optimize: z.boolean().default(true),
    gasLimit: z.string().default("30000000"),
  })
  .strict();

export const logEntry = z
  .object({ address: address, event: z.string(), args: z.record(z.string(), z.string()) })
  .strict();

export const stepResult = z
  .object({
    index: z.number().int().nonnegative(),
    name: z.string(),
    kind: z.enum(["call", "send"]),
    from: address,
    to: address,
    fn: z.string(),
    ok: z.boolean(),
    pass: z.boolean(),
    gasUsed: digits.optional(),
    returns: z.string().optional(),
    revert: z.string().optional(),
    logs: z.array(logEntry).default([]),
    note: z.string().optional(),
  })
  .strict();

export const invariantResult = z
  .object({
    name: z.string(),
    held: z.boolean(),
    expected: z.string(),
    actual: z.string(),
    op: z.string(),
  })
  .strict();

export const runOutput = z
  .object({
    hardfork: z.string(),
    compilerVersion: z.string(),
    accounts: z.record(z.string(), address),
    deployed: z.array(
      z
        .object({
          as: z.string(),
          contract: z.string(),
          address: address,
          gasUsed: digits,
          runtimeSizeBytes: z.number().int().nonnegative(),
          overSizeLimit: z.boolean(),
        })
        .strict(),
    ),
    steps: z.array(stepResult),
    invariants: z.array(invariantResult),
    balances: z.record(z.string(), digits),
    /** True only when every step matched its expectation and every invariant held. */
    pass: z.boolean(),
    failures: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .strict();

export const schemas: Record<string, z.ZodType> = {
  "plan-input": planInput,
  "run-output": runOutput,
};

export type Plan = z.output<typeof planInput>;
export type RunOutput = z.infer<typeof runOutput>;
export type StepResult = z.infer<typeof stepResult>;
export type InvariantResult = z.infer<typeof invariantResult>;
export type LogEntry = z.infer<typeof logEntry>;
