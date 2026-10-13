# Service collections

Confirmed business flow: candidate/client pays the super admin for recruiter application services. The super admin pays recruiter salary and technical recruiter commissions separately. Candidate job compensation is retained as job compensation.

Implementation: independent service enrollments, immutable monthly bill snapshots, external receipt ledger, admin APIs, candidate own read access, and a Collections workspace/dashboard. Payroll and placements retain their own joining dates.

Dates are date-only Gregorian dates; API today uses UTC and database current_date must run in UTC. Service joining day anchors every monthly boundary: January 31 → February 28/29 → March 31. Each bill covers [start, next anniversary); a service end date is inclusive. Monthly fees are fixed even for a partial final month, disclosed in the form. Bills become due on the next anniversary. A zero fee is permitted. Future enrollments produce no bill before joining.

Fees and currency are immutable agreement snapshots. An ongoing agreement may be ended once with an audited reason; the date cannot precede the inclusive end of an existing bill. Existing bill snapshots and full fees remain unchanged. This prevents a new agreement overlapping an already billed cycle. End service and create a nonoverlapping agreement for future fee changes. Each receipt belongs to exactly one bill, matches its currency, and cannot exceed the bill balance. Partial receipts are allowed. A correction is a negative ledger entry referencing the original, with a mandatory reason; originals are retained. Unique external references prevent duplicate recording. Row locks serialize competing receipts. Totals always remain grouped by currency.

The migration is manual and must be applied before using the feature. No remote database writes are performed by implementation. Database tests exercise short-month anchors, idempotency, corrections, overpayment/currency rejection, and candidate row access. Existing payroll tests cover the independent salary and job flows.
