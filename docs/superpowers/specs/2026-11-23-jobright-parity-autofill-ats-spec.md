# Jobright parity design for NextKinHR

**Approval.** Phase 1 is approved for local execution. Phase 2 is proposed for review after the Phase 1 release gate. The [implementation plan](../plans/2026-11-23-jobright-parity-autofill-ats-plan.md) records verification and execution order.

## Intent and scope

Phase 1 protects candidate data and application records and fixes the typed-field regression in Lever. Phase 2 makes the existing ATS adapter registry resilient to changes in markup, labels, choice lists, and receipt screens. The registry contains 81 adapter IDs. That count describes the scope for publishing overrides. Per-site fixture and live coverage is tracked independently. Phase 3 remains optional and depends on results measured after Phase 2.

## Approaches

A selector-only hotfix would preserve the existing architecture with minimal change, but it would leave choice normalization and receipt detection tied to extension releases. A server-first mapper could adapt to more changed fields, at the cost of sending a wider sample of application data over the network. The proposed Phase 2 design uses data-only remote rules, semantic discovery in the browser, and narrowly scoped, authenticated resolution for eligible fields that remain unresolved.

## Phase 1 release gate

- Require authenticated candidate access before generating, replaying, or saving screening answers. Only explicit user approval promotes a draft to a reusable answer.
- Keep inferred eligibility outside confirmed autofill data until candidate review. Preserve reviewed values and explicit clears through replacement uploads.
- Preserve receipt delivery across restarts and network failures. Keep queue state scoped to the user and workspace. Use transactional submission status writes and recoverable follow-up writes.
- Authenticate before parsing an upload. Bound bytes and parsing work. Use an offline unit suite and opt-in live smoke checks.
- Keep URL fields out of draft generation. Fill them from a candidate-provided absolute HTTP(S) value after validating it at write time. Preserve candidate input and leave missing values for manual entry.
- Stop after the Phase 1 verification gate. Keep changes local. Production rollout requires applying the forward migration ahead of the dependent application code and running the deployment checks in the plan.

## Phase 2 remote rule contract

A publication covers **schema**, **ruleVersion**, **publishedAt**, **minimumExtensionVersion**, and these data-only rule categories.

| Field | Runtime consumer and purpose |
| --- | --- |
| `sites` | Site detection resolves a registered adapter using validated host and URL matchers within its trust scope. |
| `selectorTables` | ATS adapters provide field hints for the active application. |
| `scrapingRules` | Form discovery identifies form boundaries, visible controls, dropdown triggers and options, file inputs, and wizard controls. Submit controls contribute to receipt arming after a user action. |
| `labelPatterns`, `fieldTypes` | Field mapping resolves normalized labels into a known fact key and bounded control kind. |
| `answerMaps` | Field mapping associates normalized answers with a choice actually present in the active control. |
| `params` | Explicitly allowlisted tuning values such as a bounded readiness wait. |
| `confirmationRules` | Receipt handling recognizes known receipt states via validated selectors, text patterns, URL shape, and receipt ID format. |
| `siteRulesKillSwitch` | The worker records explicit site availability and enforces it before filling or running fallback. |

Use a service-managed Supabase publication store. Any shipped adapter ID can receive an override. Compile and validate a complete publication before atomically changing the active version, compute the ETag over that representation, and preserve rollback history. The server uses bundled defaults if no valid publication is available and serves a consistent version on each request. Add a version-checked publish path and audit metadata. Staging a rules fix requires neither an extension release nor a Next.js redeploy. Clients pick it up on the refresh cadence, with a bounded user-initiated refresh where needed.

The worker owns the cache and resolves a compatible snapshot before autofill. A run and its receipt tracking use the same snapshot until a safe refresh boundary. Scope cached rules to the configured workspace and retain the last explicit compatible disable decision through fallback. Validate both publisher and client inputs, including bounded selectors and patterns, known fact keys, registered IDs, size limits, and safe path matchers. Treat the data as configuration and keep host permissions and executable behavior in shipped extension code.

## Discovery, mapping, and receipt fallback

1. Locate the active application and try validated remote and bundled adapter hints.
2. When a field-specific selector misses, search the active form semantically for that field. If the adapter yields no usable fields, use semantic discovery for the whole form. After failed readback, re-discover affected controls once in the same run and document, without overwriting a manual edit.
3. Apply label patterns and answer maps to discovered fields. For eligible unresolved dropdowns, radio groups, and checkbox groups, supply the authenticated server mapper with bounded semantic field metadata and opaque choice tokens. The server can return a supported fact key, live choice token, or abstention. The client checks the mapping against the current form, candidate, and approval rules before writing. Leave sensitive, consequential, or ambiguous answers for review.
4. For same-page submissions, use trusted provider-supported signals where available to corroborate a user-initiated receipt. Status and receipt identifiers must belong to the active provider, document, and attempt. Workday, Oracle Cloud, and SuccessFactors fixture scenarios will verify the evidence contract. Keep outcomes pending where the available receipt evidence is insufficient. Remote confirmation rules allow repair of an edited receipt screen without rebuilding the extension.

## Security boundaries and acceptance

- Keep third-party cookies, CSRF tokens, headers, credentials, and password synchronization out of the extension data flows. Preserve site framing protections and use the existing top-level application handoff when required.
- Keep diagnostics opt-in, application-scoped, and free of candidate or form values. Runtime resolution uses only the eligible, bounded data it needs.
- Prove a redesign on an adapter outside the bundled priority set. The test must show fallback on selector and readback failure, remote label and choice recovery, a hotfixed receipt, an offline run, rollback, and enforcement of a site disable. Verify attempts cannot be confirmed by unrelated page activity.
- Phase 2 requires separate approval after Phase 1 review. Phase 3 features such as streaming, cover-letter files, and diagnostic collection retain the security and runtime requirements in the plan.

