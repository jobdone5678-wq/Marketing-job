import { z } from 'zod';

export const PlanFillSchema = z.object({
  label: z.string(),
  value: z.string().nullish(),
  fieldId: z.string().optional(),
  evidenceIds: z.array(z.string()).optional(),
  action: z.enum(['fill', 'skip', 'defer_combobox']).optional(),
  searchQuery: z.string().optional(),
  dependsOnFieldId: z.string().optional(),
});

export const PlanContractSchema = z.object({
  fills: z.array(PlanFillSchema),
});

export const ChooseContractSchema = z.object({
  choice: z.string().nullable(),
  evidenceIds: z.array(z.string()).optional(),
  reason: z.string().optional(),
});

export type PlanFillOutput = z.infer<typeof PlanFillSchema>;
export type PlanContract = z.infer<typeof PlanContractSchema>;
export type ChooseOutput = z.infer<typeof ChooseContractSchema>;
export type ChooseContract = ChooseOutput;
