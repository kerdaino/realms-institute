This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Backend setup

1. Copy `.env.example` to `.env.local`.
2. Add your `PAYSTACK_SECRET_KEY`.
3. Set `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.
4. Run `npm run dev`.
5. Complete a registration using Paystack test credentials.

Use Paystack test mode first before any live announcement. Do not commit secret keys or use a live key during local testing.

## Supabase setup

1. Create a Supabase project.
2. Open the SQL Editor.
3. Run `supabase/schema.sql`.
4. Copy the project URL into `NEXT_PUBLIC_SUPABASE_URL`.
5. Copy the service role key into `SUPABASE_SERVICE_ROLE_KEY`.
6. Restart the development server.

Never expose `SUPABASE_SERVICE_ROLE_KEY` in client-side code or commit it to the repository.

For an existing `registrations` table, run this migration before testing new payments:

```sql
alter table registrations
add column if not exists fee_policy_consent boolean not null default false,
add column if not exists computer_access_confirmed boolean not null default false,
add column if not exists public_fee_display text,
add column if not exists exchange_note text,
add column if not exists application_status text not null default 'pending_review',
add column if not exists admin_note text,
add column if not exists reviewed_at timestamptz,
add column if not exists reviewed_by text;
```

For email tracking on an existing `registrations` table, run this migration:

```sql
alter table registrations
add column if not exists confirmation_email_sent boolean not null default false,
add column if not exists confirmation_email_sent_at timestamptz,
add column if not exists admin_email_sent boolean not null default false,
add column if not exists admin_email_sent_at timestamptz,
add column if not exists admission_email_sent boolean not null default false,
add column if not exists admission_email_sent_at timestamptz;
```

## Resend Email Setup

1. Add and verify domain in Resend.
2. Add DNS records in Vercel DNS.
3. Create Resend API key.
4. Add environment variables:

```bash
RESEND_API_KEY=
RESEND_FROM_EMAIL="REALMS Institute <admissions@mail.grccglobal.org>"
REALMS_ADMIN_EMAIL=gloryrealm2025@gmail.com
```

5. Restart dev server.
6. Test with a fresh Paystack transaction.

Email sending should never block payment verification or registration saving. Use `NEXT_PUBLIC_SITE_URL=https://realms.grccglobal.org` in production and `NEXT_PUBLIC_SITE_URL=http://localhost:3000` for local testing.

## Admin setup

1. Add `REALMS_ADMIN_PASSWORD` to `.env.local`.
2. Run the app.
3. Visit `/admin`.
4. Log in with the configured password.
5. Manage registrations from `/admin/dashboard` and `/admin/registrations`.

This is temporary password protection for launch. Replace it with proper user authentication and role-based access for long-term use.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
