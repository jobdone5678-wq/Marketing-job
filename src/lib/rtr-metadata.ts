// A right-to-represent agreement is stored twice: as a JSONB reference on the job submission
// (`job_submissions.rtr_document`) and as a metadata tag inside the notes column. The tag is the
// fallback for installations that do not have the `rtr_document` column yet, so reading and
// writing it has to behave identically in every place that touches it.
//
// The old reader used `/<!-- RTR_METADATA:\s*(\{[\s\S]*?\})\s*-->/`, which stops at the first
// closing brace. Any agreement whose notes, clause or company name contains a `}` produced an
// unparsable fragment, so the agreement silently disappeared from every list. The tag body is
// now captured up to the closing marker and parsed as JSON, with the legacy shape kept as a
// fallback.

const RTR_METADATA_TAG = /<!--\s*RTR_METADATA:\s*([\s\S]*?)\s*-->/;

export type RtrMetadata = Record<string, unknown>;

export function buildRtrMetadataTag(metadata: RtrMetadata): string {
  return `<!-- RTR_METADATA: ${JSON.stringify(metadata)} -->`;
}

export function parseRtrMetadata(notes?: string | null): RtrMetadata | null {
  if (!notes || typeof notes !== "string") return null;
  const match = notes.match(RTR_METADATA_TAG);
  if (!match) return null;

  const raw = match[1].trim();
  if (!raw) return null;

  const candidates: string[] = [];
  if (raw.startsWith("{")) candidates.push(raw);
  // Legacy shape: the JSON object ended at the first closing brace.
  const legacy = raw.match(/^(\{[\s\S]*\})/);
  if (legacy && legacy[1] !== raw) candidates.push(legacy[1]);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as RtrMetadata;
      }
    } catch {
      // Try the next candidate shape.
    }
  }
  return null;
}

export function stripRtrMetadata(notes?: string | null): string {
  if (!notes || typeof notes !== "string") return "";
  return notes
    .replace(new RegExp(RTR_METADATA_TAG.source, "g"), "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
