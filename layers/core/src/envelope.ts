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

/** Fail-closed boundary check: returns the value typed, or throws with the schema violations. */
export function mustValidate<S extends z.ZodType>(schema: S, value: unknown, boundary: string): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".") || "$"}: ${i.message}`).join("; ");
    throw new Error(`SCHEMA_INVALID at ${boundary}: ${detail}`);
  }
  return parsed.data;
}
