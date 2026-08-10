# Taliqor

Free spreadsheet reconciliation for finance teams. Users can create an account, upload two CSV exports, confirm column mappings, review explainable matches and exceptions, save decisions, and export the results.

## Local setup

1. Create a Supabase project.
2. In the Supabase SQL editor, run `supabase/migrations/0001_initial.sql`.
3. Copy `.env.example` to `.env.local` and add the project URL and publishable/anon key from **Project Settings → API**.
4. Start the app:

```powershell
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For the fastest local sign-up flow, disable **Confirm email** under Supabase Authentication → Providers → Email. If confirmation stays enabled, users must confirm their email before entering the dashboard.

## Data and security

- Authentication is managed by Supabase Auth.
- Every new account receives its own organization.
- Postgres row-level security restricts runs, templates, and files to organization members.
- Original CSV files are stored in the private `reconciliation-files` bucket.
- Parsed rows and reconciliation evidence are stored with each run.
- No service-role key is used in the application.

## Verification

```powershell
npm run build
```

