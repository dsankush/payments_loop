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
