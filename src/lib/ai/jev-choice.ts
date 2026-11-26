const JEV_URL = 'https://api.typesafe.ai/v1/systemone';
const DECLINE = 'no_supported_option';
const TIMEOUT_MS = 2_500;

export async function requestJevChoice(
  apiKey: string,
  question: string,
  options: readonly string[],
  profile: Record<string, unknown>,
  fetchFn: typeof fetch = fetch,
): Promise<string | null | undefined> {
  if (options.length > 254) return undefined;
  const choices = new Map(options.map((option, index) => [`option_${index}`, option]));
  const criteria = Object.fromEntries(choices);
  criteria[DECLINE] = 'None of the offered answers is supported by the confirmed facts.';

  try {
    const response = await fetchFn(JEV_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: 'jev-latest',
        state: { question, confirmed_facts: profile },
        questions: {
          selection: {
            type: 'choice',
            instructions: 'Select the offered answer supported by the confirmed facts. Decline when none is supported.',
            criteria,
          },
        },
      }),
    });
    if (!response.ok) return undefined;
    const result = (await response.json())?.answers?.selection;
    if (result?.type !== 'choice' || typeof result.choice !== 'string') return undefined;
    return result.choice === DECLINE ? null : choices.get(result.choice);
  } catch {
    return undefined;
  }
}
