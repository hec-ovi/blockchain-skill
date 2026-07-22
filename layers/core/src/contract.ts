import type { z } from "zod";
import { envelopeShape } from "./envelope.ts";

/**
 * Schemas this layer publishes. scripts/export-schemas.ts renders each entry
 * to schema/<name>.json; a contract test fails if the committed JSON drifts.
 * The refine() XOR check on the envelope lives in code only; the JSON Schema
 * carries the structural shape.
 */
export const schemas: Record<string, z.ZodType> = {
  envelope: envelopeShape,
};
