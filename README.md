# REALMS Institute

The public web platform for REALMS Institute, an independent Christian formation and practical-skills training institution.

Live site: https://realmsinstitute.vercel.app/

## Current public state

Public registration is closed. The School of Discovery is the active school shown on the website. Other schools presented on the site are future plans and should not be interpreted as launched programmes.

## Delivered platform areas

- Public institutional website and programme information
- School of Discovery routes and curriculum information
- Registration, applicant and payment-related workflows
- Student, learning-resource and recorded-learning workflows
- Administrative review and registration-management interfaces
- Certificate and public certificate-verification routes
- Supabase-backed data workflows
- Paystack payment integration
- Resend email integration and delivery-state handling
- Responsive interfaces and production-oriented maintenance

Some repository migrations and developing modules may require a separate deployment step. Code present in the repository is not, by itself, proof that a migration or feature is active in production.

## Architecture and boundaries

- Next.js App Router and TypeScript
- Supabase/PostgreSQL for application data
- Privileged database operations remain server-side
- Paystack transaction handling uses verified payment state rather than browser assertions
- Email-delivery state is tracked separately from payment or registration state
- Administrative and student actions retain their authorisation boundaries
- Retry-sensitive workflows use persisted idempotency and database constraints where implemented

Do not expose SUPABASE_SERVICE_ROLE_KEY, payment secrets, email API keys, administrative credentials or student data in client-side code or commits.

## Local setup

1. Copy .env.example to .env.local.
2. Add the required Supabase, Paystack, Resend and site configuration values.
3. Install dependencies with npm install.
4. Run the development server with npm run dev.
5. Open http://localhost:3000.

Use provider test modes and non-production data during local verification. Apply required database migrations before testing features that depend on them.

## Useful checks

    npm run lint
    npx tsc --noEmit
    npm run build

Run the relevant focused test scripts for any workflow being changed. A successful local build does not prove that a database migration, external email delivery or live payment flow has been deployed.

## Privacy and portfolio use

Do not publish student, applicant, payment or administrative records. Screenshots used as project evidence must contain only public pages or approved anonymised data. No learner-count, revenue, conversion, uptime or performance claim should be made without authorised records.
