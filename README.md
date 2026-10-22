# Farmer Payments

Plain HTML pages + Vercel serverless functions + Supabase (Postgres).
The browser never talks to the database. Only the server functions do, using a secret key kept in Vercel environment variables.

## Pages
- `/` — each of the 7 people logs in with their name + access code, sees their sheets of 15, copies number and amount, then marks each payment Paid or Failed.
- `/admin` — admin overview (totals per sheet and per person, carry-forward from failed payments, next sheet to fund), add new numbers, export CSV.

## Rules built into the database
- Every farmer number is stored once, forever (unique). It is never deleted.
- Prize money is a whole number from 25 to 200, set once at assignment, and cannot be changed.
- Number, person, sheet and position cannot be changed.
- Once a payment is Successful it is locked.
- A Failed number stays in its sheet with the same person until it is paid.
- Every status change is kept in `payment_events`.

## Deploy
1. Create a **private** GitHub repo and push this folder to it (the `.gitignore` already keeps secrets and data out).
2. In Vercel: Add New Project → import the repo → Framework preset "Other" → Deploy.
3. Vercel → Project → Settings → Environment Variables. Add the four names from `.env.example` (all environments), then redeploy:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API Keys → secret / service_role key)
   - `SESSION_SECRET` (any long random text, e.g. `openssl rand -hex 32`)
   - `ADMIN_CODE` (the password you choose for `/admin`)
4. Open `/` for the people and `/admin` for you.

## Tests
`npm install` then `npm test`.

## Farmer names, products and the time stamp

- Each number can carry a **farmer name** and the **products purchased**. They are loaded with the numbers, shown on the person's board, and can never be changed afterwards (a database trigger enforces this).
- **Add numbers** (admin) accepts rows copied straight from a sheet (columns `Phone`, `Farmer Name`, `Products Purchased`, tab separated) or a plain list of numbers. A number that comes without a name needs the person to type the name when marking it paid.
- The person's page shows all 15 numbers of a sheet at once. **Paid** and **Failed** record the **current time automatically**; the person can change the time before saving. Paid needs a second tap to confirm because a paid entry is locked.
- Run the tests with `npm test`.


## State and remarks

- Every number can carry a **State** (Andhra Pradesh, Karnataka, Maharashtra, Telangana). It comes with the pasted data as a 4th column
  (`Phone, Farmer Name, Products Purchased, State`), is shown on the person board, and is included in the admin tables ("Paid by state") and the CSV export.
  Like the name and products, a state cannot be changed once set. A locked (paid) number may only get a state that was never set.
- Each unpaid number has a **Remark** box (up to 200 characters). **Failed** needs a reason in the remark. **Pending** can be saved with or without a note,
  and puts a failed number back to pending. Paying clears the remark from the row; every change stays in `payment_events`.
- The admin Overview lists failed payments with State and Remark, and a "Pending with a remark" table. The export has `State` and `Remark` columns.
- New batches get amounts from 25 to 200 in steps of 25 (`randomPrize(step)` in `lib/numbers.js`).
- Pasted files can have the columns in any order when the first row is a header (`Farmer Name, Farmer Phone, Farmer State, Product`, or `Phone, Name, ...`).
  Without a header the order is phone, name, products, state.
- When a number has been removed from a person's last sheet, "fill the short last sheet first" fills that gap (the exact free positions), not just the end of the sheet.
