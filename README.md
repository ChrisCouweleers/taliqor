# Taliqor

> Revenue, reconciled.

Taliqor is reconciliation and month-end close software for finance and accounting teams. It brings spreadsheet exports, matching decisions, exceptions, supporting evidence, adjustments, review, and close progress into one controlled workspace.

**Try the open beta at [taliqor.com](https://taliqor.com).**

## 👋 Who it’s for

- Finance and accounting teams responsible for reconciliations and month-end close
- Controllers who need visibility into close readiness and outstanding work
- Reviewers who need clear support, conclusions, and an audit trail
- Growing companies with transactions spread across banks, payment processors, ERPs, and operational systems
- Operators replacing fragile spreadsheet handoffs with a repeatable process

## ✨ What Taliqor does

Taliqor helps teams move from raw exports to a review-ready reconciliation:

1. **Import two sources** — upload CSV, XLSX, or XLS exports from systems such as NetSuite, bank portals, payment processors, and internal ledgers.
2. **Map the data** — confirm suggested mappings for dates, references, descriptions, amounts, currencies, accounts, and accounting dimensions.
3. **Match transactions** — compare records using explainable reference, amount, date, description, and grouped-match logic.
4. **Review exceptions** — isolate missing, duplicated, timing-related, or mismatched transactions and assign follow-up work.
5. **Document the resolution** — classify differences, add explanations, attach evidence, and record decisions.
6. **Prepare adjustments** — create balanced journal adjustments, route them through review, export them for posting, and retain the posting reference.
7. **Certify the work** — submit reconciliations for review, request changes, and lock reviewer-approved conclusions.
8. **Complete the close** — connect reconciliations to a close checklist, review variances, resolve material items, and close the period.

## 🔍 Reconciliation capabilities

- CSV and Excel imports with worksheet selection
- Large-file architecture designed for exports containing up to 100,000 rows
- Background matching that keeps the interface responsive
- Automatic column suggestions and reusable mapping templates
- Single-amount or separate debit-and-credit mappings
- Optional account, entity, subsidiary, department, location, class, currency, and posting-period fields
- Configurable date tolerance, amount tolerance, and automatic approval threshold
- Exact-reference, exact-amount, date-tolerant, description-similarity, and many-to-one matching
- Confidence scores and plain-language evidence for every proposed match
- Exception classifications for timing, fees, refunds, chargebacks, duplicates, missing records, currency differences, deposits in transit, outstanding payments, journals, and other items
- Ownership, due dates, explanations, evidence, and proposed adjustments for exceptions
- Search, filtering, pagination, CSV exports, and printable reconciliation packets

## 🔁 Recurring account reconciliations

- Reconciliation profiles for monthly, quarterly, and yearly accounts
- Assigned preparers and reviewers
- Risk ratings, materiality, due-date offsets, and required support
- Reusable reconciliation method and accounting dimensions
- Prior-period continuity between recurring reconciliations
- Beginning-balance and period-activity roll-forwards
- Visible reconciliation history across periods

## 🧾 Adjustments and evidence

- Multi-line debit and credit journal adjustments
- Draft, review, approved, posted, and no-entry-required statuses
- Recurring adjustments and automatic reversals
- Posting dates, reversal dates, preparer and reviewer details, and external posting references
- CSV and Excel journal exports
- Supporting files attached to reconciliations, exceptions, and adjustments

## 📅 Month-end close

- Month, quarter, and year-end close workspaces
- Generated close checklists with owners, reviewers, due dates, dependencies, notes, and statuses
- Reconciliations connected directly to the applicable close period
- Trial-balance variance imports and period-over-period variance review
- Dollar and percentage materiality controls
- Close readiness based on completed procedures and certified reconciliations
- Readiness controls that prevent unresolved material adjustments or variances from being overlooked
- Required close conclusions, controlled reopening, and printable close packets

## ✅ Review and audit controls

- Preparer and reviewer workflow
- Independent certification when multiple team members are available
- Clearly recorded self-review for one-person workspaces
- Certification locks and version history
- Required reasons for requested changes and reopened work
- Append-only audit events that cannot be edited or deleted through the application
- Permanent records of preparation, review, certification, evidence, and material accounting changes

## 🔐 Workspace and security

- Email verification and one-time login codes
- Organization-isolated data enforced with row-level security
- Private source-file and evidence storage
- Owner-managed team invitations
- Rate limits, upload validation, file-type checks, and spreadsheet-formula-safe exports
- Account and workspace deletion controls

## 🚀 Open beta

Taliqor is currently in open beta. Create a free workspace at [taliqor.com](https://taliqor.com), reconcile your first two exports, and help shape the future of a calmer, faster close.

## 🛠️ Local development

Install dependencies and start the Next.js development server:

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local`, add the Supabase project values, and apply the migrations in `supabase/migrations` before using authenticated workspace features.

Quality checks:

```bash
npm test
npm run lint
npm run build
```
