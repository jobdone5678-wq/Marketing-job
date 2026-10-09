# Email confirmation capture implementation

Approved scope: the user requested email confirmation capture first, following the application-capture design in `../specs/2026-10-08-ai-recruiting-design.md`. The browser extension, Firecrawl, resume intake and full job-ingestion rebuild remain subsequent milestones.

## Deliverables

1. Durable email connections, imported receipts and an append-only confirmation event history; privilege and ownership checks on all endpoints.
2. Conservative receipt extraction/correlation: exact candidate identity plus company/job evidence, deduplication, no outreach promoted to confirmation, ambiguous mail routed to review.
3. A compact Email confirmations page with connection/setup, sync health, manual receipt import, review/assignment and links to the existing submission tracker.
4. Automatic background mailbox sync for the selected provider, encrypted refresh tokens, OAuth state protection and revocation/disconnection. Mailbox provider is selected through the pending user question; shared storage/parser/UI are independent of that choice.
5. Tests for parsing, matching, event status rules, authorization, provider failure/replay and token protection; typecheck, changed-file lint and production build. Live mailbox verification requires provider configuration and user consent.

## Implementation steps

- [x] Write and run failing unit tests for extraction, candidate attribution, missing/ambiguous job context, forwarded/manual receipt provenance and late-event handling.
- [x] Implement pure receipt/correlation functions and their typed contracts.
- [x] Add an additive SQL migration with receipt/event tables, unique message keys, atomic confirmation/review transaction and RLS. Keep role/status changes protected and receipt bodies private to the connecting user.
- [x] Add authenticated receipt/status/review/import endpoints and server-only configuration/crypto.
- [x] Implement the chosen provider's read-only connection, incremental bounded sync and scheduled worker. Do not build an unselected provider or pretend that unconfigured mailboxes are connected.
- [x] Add the review UI/sidebar entry and fix submission demo fallbacks in the touched workflow so confirmation records cannot be confused with samples.
- [x] Verify synthetic receipt processing, replay/authorization/failure tests, typecheck, lint and build; document setup and unverified live dependencies.

No email is sent and no external job application is submitted by this feature. Manual .eml import is marked user-supplied evidence and requires review; only connected-provider receipts that pass correlation can be auto-confirmed. Applications confirmed by a receipt do not overwrite later recruiting statuses such as interviews/offers/rejection.

Implemented and locally verified. Gmail was selected as an announced initial assumption after the provider question remained unanswered. Live activation is pending credentials, database migration, mailbox consent and worker deployment; see docs/operations/email-confirmation-setup.md and the execution ledger.
