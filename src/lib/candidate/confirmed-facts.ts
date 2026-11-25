// The legacy resume upload path creates a candidate row before the user reviews its extraction.
export const UNSAVED_RESUME_NOTE =
  'Profile created from an uploaded resume. Review the extracted facts and edit anything that is wrong.';

export function isUnreviewedResume(facts: Record<string, unknown>) {
  // A subsequent portal save sets uploadedAt even when it preserves an older notes field.
  return facts.notes === UNSAVED_RESUME_NOTE && !facts.uploadedAt;
}
