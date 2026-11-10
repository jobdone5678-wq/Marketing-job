import { z } from 'zod';
import { CaptureError } from '@/lib/db/admin';

const sensitive = /password|secret|token|credential|payment|credit.?card|bank|routing|ssn|social.?security|tax.?id|birth.?date|dob|medical|health|disability|ethnicity|race|gender|veteran|religion|consent|privacy|captcha|otp|one.?time.?code/i;
const relevant=/name|email|phone|mobile|address|city|state|zip|postal|country|location|linkedin|portfolio|website|github|skill|experience|employ|education|school|university|degree|qualif|company|title|role|position|salary|compensation|rate|availab|notice|start|relocat|sponsor|authori|work.?permit|cover.?letter|message|hear|referr|interest|project|summary/i;
const answerSchema = z.object({
  key: z.string().trim().min(1).max(160),
  label: z.string().trim().min(1).max(200),
  value: z.string().max(4000),
}).strict();

export type ApplicationAnswer = z.infer<typeof answerSchema>;

export function validateApplicationAnswers(input: unknown): ApplicationAnswer[] {
  if (!Array.isArray(input) || input.length > 100) throw new CaptureError('Application answer snapshot is invalid.', 400);
  const seen = new Set<string>();
  const answers = input.map((item, index) => {
    const result = answerSchema.safeParse(item);
    if (!result.success) throw new CaptureError(`Application answer ${index + 1} is invalid.`, 400);
    const normalized = result.data;
    const key = normalized.key.toLowerCase();
    if (sensitive.test(`${key} ${normalized.label}`)||!relevant.test(`${key} ${normalized.label}`)) return null;
    if (seen.has(key)) throw new CaptureError('Application answer fields must be unique.', 400);
    seen.add(key);
    return normalized;
  });
  return answers.filter((answer): answer is ApplicationAnswer => answer !== null);
}
