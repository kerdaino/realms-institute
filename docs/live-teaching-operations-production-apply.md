# Live teaching operations: manual production apply

This change preserves existing recording, attendance, make-up, summary, and
student activity. The application does not execute SQL.

Recording duration and checkpoint time authoring remains application-only:
staff enter `HH:MM:SS` or `MM:SS`, while the existing seconds columns keep
their current meaning. No additional migration is required for that UX.

## Apply order

1. Take a current Supabase backup and record the deployed application revision.
   Export the current `pg_policies` rows for the three summary tables and the
   current summary-table constraint/index definitions before applying.
2. Confirm the baseline LMS schema and Builds 6, 7, 8, and 9 are already present.
3. Confirm `supabase/lms_late_entry_catchup.sql` is already present because the
   live purpose constraint includes `LE-C`.
4. Review and apply `supabase/lms_live_teaching_operations.sql` in one transaction.
5. Run `supabase/lms_live_teaching_operations_verify.sql`; duplicate-state queries
   must return zero rows. Review exception queues without changing live records.
6. In controlled staging, run the non-empty assigned/unrelated/inactive
   facilitator RLS procedure documented at the end of the verification file.
7. Deploy the application only after the migration and verification pass.
8. Smoke-test one draft recording, one recorded-route fixture, one approved
   make-up fixture, and one summary review cycle using designated test records.

## Rollback considerations

- Prefer rolling the application back while leaving additive columns, indexes,
  and review events in place. They do not alter existing attendance evidence.
- Do not drop summary review columns or `class_summary_review_events` after the
  new workflow has been used; doing so would destroy audit history.
- If the migration fails, its transaction rolls back as a unit.
- If a policy issue is found after commit, replace the canonical policies and
  RPCs in a new reviewed migration. Do not restore the obsolete permissive draft
  policies.
- A pre-use rollback may drop the three new RPCs/review-event table and restore
  the captured constraints/policies. After any review event or amendment exists,
  use a forward corrective migration instead so audit evidence is not lost.
- Never delete or rewrite `session_attendance`, `recording_learning_assignments`,
  `makeup_requirements`, `class_summaries`, or `class_summary_versions` as a
  rollback shortcut.
