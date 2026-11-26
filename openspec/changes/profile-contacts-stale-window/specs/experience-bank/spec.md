> The Next.js resume route and candidate UI expose profile contacts and parse state. Verify stale-window parity against the imported requirements before treating all cases as supported. See the [current-stack design](../../design.md) for the runtime mapping. The requirements below define behavior and compatibility, including upstream interface names.

## ADDED Requirements

### Requirement: Bank-through-stale on the résumé read keeps identity visible

Serving banked work history on `GET /api/v1/me/resume` while the structured stamp is stale MUST NOT produce a profile parse view that looks like a complete extract with missing identity. Banked experience MAY appear in that window; contact fields MUST follow the résumé-structured-profile pending-window rules (provisional contacts from a superseded blob when available, otherwise empty with an explicit pending signal). API-key and assistant profile tools that use the contact-free professional projection remain contact-free.

#### Scenario: Stale window still shows provisional contacts on the cookie résumé read

- **WHEN** the experience bank has roles, the structure stamp is stale, and the superseded structure holds contacts
- **THEN** the cookie résumé read used by the profile Profile tab includes those contacts alongside banked experience

#### Scenario: Contact-free professional projection is unchanged

- **WHEN** an API-key or assistant consumer reads the profile `cv` block or the contact-free professional projection during a stale window
- **THEN** contact fields remain absent from that projection
