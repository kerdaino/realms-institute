-- REALMS Institute LMS / SIS - versioned student document acknowledgements.
-- REVIEW AND APPLY MANUALLY. This file is intentionally not executed by the app.

begin;

create table if not exists public.student_document_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  document_type text not null check (length(trim(document_type)) > 0),
  document_version text not null check (length(trim(document_version)) > 0),
  document_title text not null check (length(trim(document_title)) > 0),
  effective_cohort_id uuid not null references public.cohorts(id) on delete restrict,
  acknowledgement_text_snapshot text not null check (length(trim(acknowledgement_text_snapshot)) > 0),
  acknowledged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists student_document_acknowledgements_student_version_unique_idx
  on public.student_document_acknowledgements (student_id, document_type, document_version);

create index if not exists student_document_acknowledgements_cohort_status_idx
  on public.student_document_acknowledgements (effective_cohort_id, document_type, document_version, acknowledged_at);

-- Acknowledgements are permanent historical records. This trigger also blocks
-- mutations made through a privileged application client; corrections require
-- an explicit, separately reviewed migration rather than silently rewriting or
-- deleting what a student acknowledged.
create or replace function public.prevent_student_document_acknowledgement_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Student document acknowledgements are immutable.';
end;
$$;

drop trigger if exists prevent_student_document_acknowledgement_mutation
  on public.student_document_acknowledgements;
create trigger prevent_student_document_acknowledgement_mutation
  before update or delete on public.student_document_acknowledgements
  for each row execute function public.prevent_student_document_acknowledgement_mutation();

alter table public.student_document_acknowledgements enable row level security;

drop policy if exists "students read own document acknowledgements" on public.student_document_acknowledgements;
create policy "students read own document acknowledgements"
  on public.student_document_acknowledgements for select
  to authenticated
  using (
    exists (
      select 1
      from public.students
      where students.id = student_document_acknowledgements.student_id
        and students.profile_id = auth.uid()
    )
  );

-- Students receive SELECT only. A protected server action re-resolves the
-- authenticated student and inserts through the service role. No authenticated
-- INSERT, UPDATE, or DELETE policy exists. The mutation trigger additionally
-- protects the history from privileged application writes.
revoke all on public.student_document_acknowledgements from anon, authenticated;
grant select on public.student_document_acknowledgements to authenticated;

commit;
