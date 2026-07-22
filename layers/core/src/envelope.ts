import { z } from "zod";
import { randomUUID } from "node:crypto";

export const CONTRACT_VERSION = "1.0.0";

export const errorShape = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    message: z.string().min(1),
    hint: z.string().optional(),
  })
  .strict();

export const metaShape = z
  .object({
    layer: z.string().min(1),
    backend: z.string().min(1),
    chain: z.string().optional(),
    elapsedMs: z.number().int().nonnegative(),
    traceId: z.string().min(1),
  })
  .catchall(z.unknown());

export const envelopeShape = z
  .object({
    contractVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    ok: z.boolean(),
    data: z.unknown().optional(),
    error: errorShape.optional(),
    meta: metaShape,
  })
  .strict()
  .refine((e) => (e.ok ? e.error === undefined : e.error !== undefined), {
    message: "ok=true forbids error; ok=false requires error",
  });

export type EnvelopeError = z.infer<typeof errorShape>;
export type EnvelopeMeta = z.infer<typeof metaShape>;
export type Envelope<T = unknown> = Omit<z.infer<typeof envelopeShape>, "data"> & { data?: T };

interface MetaInput {
  layer: string;
  backend: string;
  chain?: string;
  startedAt?: number;
  traceId?: string;
}

function buildMeta(m: MetaInput): EnvelopeMeta {
  const meta: EnvelopeMeta = {
    layer: m.layer,
    backend: m.backend,
    elapsedMs: m.startedAt === undefined ? 0 : Math.max(0, Math.round(performance.now() - m.startedAt)),
    traceId: m.traceId ?? randomUUID(),
  };
  if (m.chain !== undefined) meta.chain = m.chain;
  return meta;
}

export function ok<T>(m: MetaInput, data: T): Envelope<T> {
  return { contractVersion: CONTRACT_VERSION, ok: true, data, meta: buildMeta(m) };
}

export function fail(m: MetaInput, code: string, message: string, hint?: string): Envelope<never> {
  const error: EnvelopeError = hint === undefined ? { code, message } : { code, message, hint };
  return { contractVersion: CONTRACT_VERSION, ok: false, error, meta: buildMeta(m) };
}

/** Error with a closed-set code and an optional steering hint for the calling agent. */
export class CodedError extends Error {
  readonly code: string;
  readonly hint: string | undefined;
  constructor(code: string, message: string, hint?: string) {
    super(message);
    this.code = code;
    this.hint = hint;
  }
}

/**
 * Runs a layer operation and always returns an envelope: CodedError becomes
 * its code, anything else becomes UNEXPECTED. Layers never leak exceptions.
 */
export async function run<T>(m: Omit<MetaInput, "startedAt">, fn: () => T | Promise<T>): Promise<Envelope<T>> {
  const meta = { ...m, startedAt: performance.now() };
  try {
    return ok(meta, await fn());
  } catch (e) {
    if (e instanceof CodedError) return fail(meta, e.code, e.message, e.hint);
    return fail(meta, "UNEXPECTED", String(e instanceof Error ? e.message : e));
  }
}

/** Fail-closed boundary check: returns the value typed, or throws with the schema violations. */
export function mustValidate<S extends z.ZodType>(schema: S, value: unknown, boundary: string): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".") || "$"}: ${i.message}`).join("; ");
    throw new CodedError("SCHEMA_INVALID", `SCHEMA_INVALID at ${boundary}: ${detail}`);
  }
  return parsed.data;
}
