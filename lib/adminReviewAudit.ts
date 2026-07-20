import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const adminReviewer = "REALMS Admin";

export type RegistrationReviewEventType =
  | "alumni_verified"
  | "alumni_not_verified"
  | "alumni_more_information_required"
  | "advanced_entry_approved"
  | "foundation_required"
  | "screening_more_information_required"
  | "scholarship_approved_full"
  | "scholarship_approved_partial"
  | "scholarship_declined"
  | "scholarship_more_information_required";

export async function recordReviewDecision(supabase: SupabaseClient, input: {
  registrationId: string;
  eventType: RegistrationReviewEventType;
  note: string | null;
  previousState: Record<string, unknown>;
  newState: Record<string, unknown>;
  actor?: string;
}) {
  const { error } = await supabase.from("registration_review_events").insert({
    registration_id: input.registrationId,
    event_type: input.eventType,
    previous_state: input.previousState,
    new_state: input.newState,
    note: input.note,
    actor: input.actor || adminReviewer,
    created_at: new Date().toISOString(),
  });
  if (error) console.error("Registration review history insert failed after the review decision was saved", error);
}
