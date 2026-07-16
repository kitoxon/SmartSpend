# SmartSpend

A private, installable finance tracker for PC and smartphone. Data is cached locally for offline use and synchronized through Supabase when a connection is available.

## First-time setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and add the Supabase project URL and **publishable/anon** key. Never use a service-role key in this app.
3. In the Supabase SQL editor, run [`supabase/migrations/20260716_secure_sync.sql`](supabase/migrations/20260716_secure_sync.sql).
4. In Supabase Authentication settings:
   - Enable the Email provider.
   - Set the Site URL to the deployed SmartSpend URL.
   - Add local and deployed URLs to Redirect URLs, for example `http://localhost:3000/**` and `https://your-app.example/**`.
5. Run `npm run dev`, sign in once with your email, and confirm the session opens.
6. If the project already contains SmartSpend rows, run [`supabase/claim_legacy_data.sql`](supabase/claim_legacy_data.sql) once. With one Auth user it selects your account automatically; with multiple users, set `owner_email` in the script first. This assigns old rows to your account.
7. Since this is a one-person app, disable **Allow new users to sign up** in Supabase Auth configuration after your account exists. Existing users can still sign in.

The client key is intentionally public. Privacy comes from Supabase Auth plus Row Level Security, which restricts every row to its `user_id`.

## Commands

- `npm run dev` — local development server
- `npm run build` — production build
- `npm run preview` — preview the production build

## Sync behavior

- Changes are written to the local device immediately.
- Failed cloud writes are queued and retried when the browser reconnects or when Retry is selected in Sync & Settings.
- Recurring occurrences use deterministic IDs, preventing duplicate entries from two devices processing the same due date.
- Sync & Settings includes recurring-rule deletion, sign-out, sync health, and JSON backup export.

Reference: [Supabase passwordless email auth](https://supabase.com/docs/reference/javascript/auth-signinwithotp), [Auth access configuration](https://supabase.com/docs/guides/auth/general-configuration), and [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
