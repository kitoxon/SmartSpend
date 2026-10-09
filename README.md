# Runway

A private, installable money planner for PC and smartphone, organized around pay cycles instead of calendar months. Data is cached locally for offline use and synchronized through Supabase when a connection is available.

## How it works

- **Pay cycle.** A cycle runs from payday to the day before the next payday. Payday is the 20th (configurable), moved to the business day before when it falls on a weekend, a Japanese national holiday, or the bank new-year break (Dec 31 – Jan 3).
- **Payday check-in.** Confirm the salary and the money left before it arrived, enter each card's bill, update any transfer bill that changed, and choose how much to set aside. Runway shows what is free for the cycle and a per-day amount.
- **Credit cards.** Each month's purchases close at month end and are paid the next month on the card's payment day, moved to the next business day. Card purchases are never logged one by one; each card is one bill per month.
- **Splitting a card bill.** If a bill can't be paid in full, part of it becomes an installment debt. Its monthly principal and interest are counted inside that card's following bills, not as a separate payment, and paying the bill pays the installment.
- **Transfer bills.** Rent, utilities and fees paid by bank transfer, repeating every month or once a year (for example an annual fee in April). A yearly bill is counted in the cycle its due date falls in. Bills whose amount varies keep an estimate until confirmed.
- **Other income.** Refunds, gifts or side work go in with "Log income instead" from the cash pad and add to the cycle. Salary (and overtime paid with it) is entered at the payday check-in instead.
- **One-off transfers.** Irregular payments like an exam or tournament entry fee are logged as expenses with the cash pad; "Hobbies" groups them.
- **Cash spending.** Only cash and debit spending is logged, with the quick number pad (+). Moving money into a savings goal is not spending.
- **Starting mid-cycle.** "Start from today" uses today's balance and ignores bills and spending before today, so tracking can begin before the next payday.
- **Today's budget.** What was left this morning, spread over the days to payday. It stays fixed through the day, so you can see how much of today's amount is left.
- **Savings.** The amount set aside at check-in can go straight into a goal. Editing the check-in adjusts the goal instead of adding twice.
- **Late check-in.** Bills whose due date already passed when you check in are marked paid.
- **Cards tab.** Type each card's "used so far" total from its app now and then. Runway adds your usual pace for the rest of the month and shows next cycle's free money on Home. Early in a month, last month's closed total is shown too, since that is what the next payday pays. The tab also charts purchases per card by month and lists split installments.
- **Balance check.** Enter your real balance; any difference is recorded as a "Balance adjustment" so the plan matches the bank again.
- **Cycle history.** Where each cycle's money went: transfer bills, cards, cash, savings and what was left.
- **Imports.** On the Cards tab, import a month of PayPay app history (CSV, English or Japanese) or a statement CSV from the Vpass website (Amazon Mastercard, Olive; Shift_JIS is read automatically). Both show the card's spending by category and top places. A PayPay import counts only the part charged to the card and can fill in its month total; a Vpass statement can set the bill itself. On リボ払い (revolving payment) the statement shows how much of the purchases isn't in this bill and carries over with interest. Imports never become expenses: the card bill stays one payment in the plan.

## First-time setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and add the Supabase project URL and **publishable/anon** key. Never use a service-role key in this app.
3. In the Supabase SQL editor, run [`supabase/migrations/20260716_secure_sync.sql`](supabase/migrations/20260716_secure_sync.sql), then [`supabase/migrations/20261009_pay_cycle_planner.sql`](supabase/migrations/20261009_pay_cycle_planner.sql).
4. In Supabase Authentication settings:
   - Enable the Email provider.
   - Set the Site URL to the deployed Runway URL.
   - Add local and deployed URLs to Redirect URLs, for example `http://localhost:3000/**` and `https://your-app.example/**`.
5. Run `npm run dev`, sign in once with your email, and confirm the session opens.
6. If the project already contains rows from before sign-in existed, run [`supabase/claim_legacy_data.sql`](supabase/claim_legacy_data.sql) once. With one Auth user it selects your account automatically; with multiple users, set `owner_email` in the script first.
7. Since this is a one-person app, disable **Allow new users to sign up** in Supabase Auth configuration after your account exists. Existing users can still sign in.
8. In the app, open **More → Cards and bills** and save your cards, bills and payday.

If Sync and settings reports that `next_due` does not exist or that legacy `nextdue` cannot be null, run [`supabase/repair_recurring_schema.sql`](supabase/repair_recurring_schema.sql) once, then select **Sync now**.

The client key is intentionally public. Privacy comes from Supabase Auth plus Row Level Security, which restricts every row to its `user_id`.

## Upgrading from SmartSpend

- Run `20261009_pay_cycle_planner.sql` once. It adds the `planner_records` table and a `cardId` column on `debts`; existing data is untouched.
- Existing transactions stay available in Activity as history.
- Once cards or bills are set up, old recurring entries stop adding expenses, so a bill is never counted twice. Remove them in **Sync and settings**.
- Debts that were used to track credit cards are no longer needed; delete them or mark them paid.

## Commands

- `npm run dev` — local development server
- `npm test` — unit tests for paydays, holidays, due dates and cycle math
- `npm run build` — production build
- `npm run preview` — preview the production build

## Sync behavior

- Changes are written to the local device immediately.
- Failed cloud writes are queued and retried when the browser reconnects or when Sync now is selected.
- Planner records (cards, bills, statements, check-ins, settings) share one table with a JSON body, so new fields need no migration.
- A queued change that keeps failing does not hold back other changes. If the database is missing the planner migration, Sync and settings says so.
- On desktop, use `Alt+E` to add a cash expense and `Alt+I` to add income. In the cash pad, digits, Backspace and Enter work from the keyboard.
- On Android, long-press the installed app icon and choose **Add cash expense** to open the number pad directly (`/?action=cash`).

Reference: [Supabase passwordless email auth](https://supabase.com/docs/reference/javascript/auth-signinwithotp), [Auth access configuration](https://supabase.com/docs/guides/auth/general-configuration), and [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
