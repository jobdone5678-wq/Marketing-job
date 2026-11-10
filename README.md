# Recruiting and candidate portal

Next.js/Supabase recruiting workspace with reviewed resume intake, persistent candidates/vendors/submissions, stored public contract jobs, evidence-based AI comparison, factual packet drafts, and linked browser/email application capture.

See [the recruiting runbook](docs/operations/ai-recruiting-runbook.md) for migrations, server credentials, private storage, supervised worker hosting, extension setup, tests and operational limits. Email setup is documented in [email-confirmation-setup.md](docs/operations/email-confirmation-setup.md).

```powershell
npm install
npm run dev
npm run worker
```

The worker is a separate process. Missing configuration is reported honestly; no demo records or simulated successful writes are supplied. Firecrawl is deferred. Automation observes applications on supported templates and authorized email receipts; it does not send emails or submit external applications.

Validation: npm run test:unit, npm run test:e2e, npm run typecheck, npm run lint, npm run build. Browser tests use an isolated production build and synthetic HTTP fixtures, preserving any existing dev server.

Implementation decisions and verification evidence: [execution ledger](docs/operations/recruiting-progress.md).
