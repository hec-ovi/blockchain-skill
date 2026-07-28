import { z } from "zod";

export const stepOutput = z
  .object({
    mode: z.string(),
    step: z.string(),
    /** 1-based position of this step in its mode's sequence. */
    index: z.number().int().positive(),
    total: z.number().int().positive(),
    /** How many times this step has been served in the current walk. */
    visits: z.number().int().positive(),
    workDir: z.string(),
    body: z.string().min(1),
    /** Absolute path this step must write before the walk can advance past it. */
    artifact: z.string().optional(),
    next: z.string().optional(),
    nextCommand: z.string(),
  })
  .strict();

export const modeListOutput = z
  .object({
    modes: z.array(
      z
        .object({
          mode: z.string(),
          purpose: z.string(),
          steps: z.array(z.string()),
        })
        .strict(),
    ),
  })
  .strict();

export const walkStatusOutput = z
  .object({
    workDir: z.string(),
    mode: z.string().optional(),
    started: z.boolean(),
    steps: z.array(
      z
        .object({
          step: z.string(),
          visits: z.number().int().nonnegative(),
          artifact: z.string().optional(),
          saved: z.boolean(),
        })
        .strict(),
    ),
    blockedBy: z.string().optional(),
  })
  .strict();

export const schemas: Record<string, z.ZodType> = {
  "step-output": stepOutput,
  "mode-list-output": modeListOutput,
  "walk-status-output": walkStatusOutput,
};

export type StepOutput = z.infer<typeof stepOutput>;
export type ModeListOutput = z.infer<typeof modeListOutput>;
export type WalkStatusOutput = z.infer<typeof walkStatusOutput>;
