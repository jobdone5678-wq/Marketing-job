# Answer topic normalization

The TypeScript [Answer Bank service](../../../src/lib/candidate/answerbank.ts) owns topic keys. `normalizeAnswerBankTopic` checks a small deterministic topic dictionary and falls back to `foldQuestionForTopic` for unfamiliar wording. The fallback lets novel employer questions remain bankable without adding a dictionary rule.

The [shared matcher](../../../src/lib/ai/reusable-answers.ts) checks folded wording first and then the stored canonical topic. Topic matching preserves qualifiers such as salary currency and period or a location named in a relocation question. The extension and server use this matcher before requesting a generated answer.

- Fold Unicode letters and numbers. Preserve enough wording to distinguish different questions, including desired and current salary and questions in a non-Latin script.
- Reject a question whose normalized text yields an empty key. For unlabeled fields, the caller may supply the actual field identifier used in review. A punctuation-only label must fail validation when it has no usable question text.
- Keep topic selection pure and independent of models, I/O, and user context. The service separately handles ownership, provenance, and the work-authorization and demographic exclusions.

Use the [Answer Bank contract tests](../../../tests/answer-bank-api.test.mjs) when changing the dictionary or folding rules.

<details>
<summary>Original Freehire reference</summary>

> Historical implementation and evidence from the Go/SvelteKit project. Paths, deployment commands, progress and measurements refer to that source.

# Answer topics

## Scope
`internal/dict/answertopic` — keys an employer's screening question by what it asks, so one
banked answer serves every phrasing of it.

## Always true
- **The dictionary is an accelerator, never the only route.** A question it does not know
  still keys, from the fold alone. This ordering is deliberate: `internal/api/atsapply`'s
  own `labelAnswerKeyFor` was a sole-route list, and its missing salary rule was invisible
  precisely because nothing reports the questions a list fails to match.
- **A question that folds to nothing is refused, never stored under an empty key.** A label
  of pure punctuation is what real forms produce, and a key derived from nothing can never
  be recalled.
- **A labelless field is not that case.** Greenhouse's DOM-only inputs carry no label —
  `country`, required on nearly every posting, is the commonest of them — and the caller
  keys those by the field's own id (`internal/api/atsapply`'s `questionText`), which is also
  the text the review screen titles the input with. This package sees "country" and keys it.
  It refused for a while, and the effect was that the single most frequent parking question
  in the product was the one question the bank could never learn.
- **The fold is Unicode, not ASCII.** This catalogue aggregates Russian- and
  Hungarian-language sources, so a question genuinely arrives in one. An ASCII range refuses
  every such question as "no readable text" — and keeps whatever Latin fragment it carried,
  so `Зарплата (USD)` folded to `usd` and pulled every other question mentioning that
  currency onto one topic. The alphabet is the curated-list trap in another shape.
- **Two different questions must never collapse.** `desired salary` and `current salary`
  are the worked example: merging them answers one with the other, in the candidate's name,
  to an employer. A test asserts they stay apart; keep it when adding dictionary entries.
- **Pure.** No model, no I/O, no user. A model proposing a topic is out of scope by design.

</details>
