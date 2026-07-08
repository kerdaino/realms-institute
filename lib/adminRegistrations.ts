import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isApplicationStatus, type ApplicationStatus } from "@/lib/applicationStatus";
import { learningModes, skillPathways } from "@/lib/constants";

export const adminRegistrationFields = "id, created_at, full_name, email, whatsapp, country, city, gender, age_range, church, learning_mode, skill_pathway, reason, referral_source, consent, amount, currency, amount_display, payment_reference, payment_status, application_status, admin_note, reviewed_at, reviewed_by, paid_at, confirmation_email_sent, admin_email_sent";

export type AdminRegistration = {
  id: string; created_at: string; full_name: string; email: string; whatsapp: string; country: string; city: string;
  gender: string; age_range: string; church: string | null; learning_mode: string; skill_pathway: string; reason: string;
  referral_source: string; consent: boolean; amount: number; currency: string; amount_display: string | null;
  payment_reference: string; payment_status: string; application_status: ApplicationStatus; admin_note: string | null; reviewed_at: string | null; reviewed_by: string | null; paid_at: string | null; confirmation_email_sent: boolean; admin_email_sent: boolean;
};

export type RegistrationSummary = { total: number; paid: number; physical: number; online: number; webDevelopment: number; cybersecurity: number; nigerian: number; international: number; pendingReview: number; admitted: number; contacted: number; waitlisted: number; notAdmitted: number };
export type RegistrationFilters = { search?: string; learningMode?: string; skillPathway?: string; country?: string; paymentStatus?: string; applicationStatus?: string; from?: string; to?: string };

export function readRegistrationFilters(searchParams: URLSearchParams): RegistrationFilters {
  const value = (key: string) => searchParams.get(key)?.trim().slice(0, 160) || undefined;
  return { search: value("search"), learningMode: value("learningMode"), skillPathway: value("skillPathway"), country: value("country"), paymentStatus: value("paymentStatus"), applicationStatus: value("applicationStatus"), from: value("from"), to: value("to") };
}

function validDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) ? null : value;
}

export async function fetchAdminRegistrations(supabase: SupabaseClient, filters: RegistrationFilters) {
  let query = supabase.from("registrations").select(adminRegistrationFields).order("created_at", { ascending: false }).limit(5000);
  const search = filters.search?.replace(/[^\p{L}\p{N}@+._\-\s]/gu, "").trim();
  if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,whatsapp.ilike.%${search}%`);
  if ((learningModes as readonly string[]).includes(filters.learningMode ?? "")) query = query.eq("learning_mode", filters.learningMode!);
  if ((skillPathways as readonly string[]).includes(filters.skillPathway ?? "")) query = query.eq("skill_pathway", filters.skillPathway!);
  if (filters.country && /^[\p{L}\s.'-]{2,80}$/u.test(filters.country)) query = query.ilike("country", filters.country);
  if (filters.paymentStatus && /^[a-z_-]{2,30}$/i.test(filters.paymentStatus)) query = query.eq("payment_status", filters.paymentStatus);
  if (isApplicationStatus(filters.applicationStatus ?? "")) query = query.eq("application_status", filters.applicationStatus!);
  const from = validDate(filters.from);
  const to = validDate(filters.to);
  if (from) query = query.gte("created_at", `${from}T00:00:00.000Z`);
  if (to) query = query.lt("created_at", `${to}T23:59:59.999Z`);
  const { data, error } = await query;
  if (error) throw new Error(`Could not load registrations: ${error.message}`);
  return (data ?? []) as AdminRegistration[];
}

export function summarizeRegistrations(registrations: AdminRegistration[]): RegistrationSummary {
  return registrations.reduce((summary, registration) => {
    summary.total += 1;
    if (registration.payment_status === "success") summary.paid += 1;
    if (registration.learning_mode === "Physical") summary.physical += 1;
    if (registration.learning_mode === "Online") summary.online += 1;
    if (registration.skill_pathway === "Web Development") summary.webDevelopment += 1;
    if (registration.skill_pathway === "Cybersecurity Foundations") summary.cybersecurity += 1;
    if (registration.country.trim().toLowerCase() === "nigeria") summary.nigerian += 1; else summary.international += 1;
    if (registration.application_status === "pending_review") summary.pendingReview += 1;
    if (registration.application_status === "admitted") summary.admitted += 1;
    if (registration.application_status === "contacted") summary.contacted += 1;
    if (registration.application_status === "waitlisted") summary.waitlisted += 1;
    if (registration.application_status === "not_admitted") summary.notAdmitted += 1;
    return summary;
  }, { total: 0, paid: 0, physical: 0, online: 0, webDevelopment: 0, cybersecurity: 0, nigerian: 0, international: 0, pendingReview: 0, admitted: 0, contacted: 0, waitlisted: 0, notAdmitted: 0 });
}
