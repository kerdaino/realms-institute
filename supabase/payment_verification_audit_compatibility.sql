-- Apply separately in Supabase after review. This file is intentionally not
-- executed by the application or by the verification tests.
begin;

alter table public.registration_review_events
  alter column review_type drop not null,
  alter column action drop not null,
  alter column reviewed_by drop not null;

update public.registration_review_events
set
  event_type = coalesce(event_type, review_type, action, 'review_event'),
  note = coalesce(note, review_note),
  actor = coalesce(actor, reviewed_by, 'REALMS Admin'),
  created_at = coalesce(created_at, reviewed_at, now())
where event_type is null
   or (note is null and review_note is not null)
   or actor is null
   or created_at is null;

alter table public.registration_review_events
  alter column event_type set not null,
  alter column actor set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

create unique index if not exists registration_review_events_payment_verified_reference_uidx
  on public.registration_review_events (registration_id, (new_state ->> 'payment_reference'))
  where event_type = 'payment_verified'
    and nullif(new_state ->> 'payment_reference', '') is not null;

alter table public.registration_review_events enable row level security;

commit;
