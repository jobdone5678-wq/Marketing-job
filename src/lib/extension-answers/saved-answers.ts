type ApprovedAnswer = {
  approved: true;
  answer: string;
};

export function approvedSavedAnswers(value: unknown): Record<string, ApprovedAnswer> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const approved = Object.entries(value).filter((entry): entry is [string, ApprovedAnswer] => {
    const answer = entry[1] as Partial<ApprovedAnswer> | null;
    return answer?.approved === true && typeof answer.answer === 'string' && !!answer.answer.trim();
  });

  return Object.fromEntries(approved);
}
