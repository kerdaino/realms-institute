"use client";

import { useState, type FormEvent } from "react";

import { PrimaryButton } from "@/components/ui/Button";
import { ageRanges, genderOptions, learningModes, skillPathways } from "@/lib/constants";
import { calculateCohortFee } from "@/lib/registration";

const inputClass = "min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none placeholder:text-slate-400 focus:border-[#a47720] focus:ring-2 focus:ring-[#d7aa45]/20";

export function RegistrationForm() {
  const [country, setCountry] = useState("");
  const [learningMode, setLearningMode] = useState("");
  const [skillPathway, setSkillPathway] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fee = calculateCohortFee({ country, learningMode });
  const isInternationalPhysical = Boolean(country.trim())
    && country.trim().toLowerCase() !== "nigeria"
    && learningMode === "Physical";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!fee) {
      setError("Please select your country and learning mode to calculate the registration and cohort participation fee.");
      return;
    }
    if (isInternationalPhysical) {
      setError("Physical attendance is currently designed for students who can attend onsite in Nigeria. Please select Online unless you have confirmed onsite availability.");
      return;
    }
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = Object.fromEntries(form.entries());
    payload.consent = form.get("consent") === "on";
    payload.amount = fee.amount;
    payload.currency = fee.currency;
    try {
      const response = await fetch("/api/paystack/initialize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok || !result.success || !result.authorizationUrl) throw new Error(result.message || "Payment could not be started.");
      window.location.href = result.authorizationUrl;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment could not be started.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-6" aria-describedby="registration-note pricing-note registration-error">
      <div className="grid gap-5 md:grid-cols-2">
        <Field name="fullName" label="Full name" autoComplete="name" />
        <Field name="email" label="Email address" type="email" autoComplete="email" />
        <Field name="whatsapp" label="WhatsApp number" type="tel" autoComplete="tel" />
        <label className="grid gap-2 text-sm font-semibold text-slate-800">
          <span>Country</span>
          <input required name="country" id="country" autoComplete="country-name" value={country} onChange={(event) => setCountry(event.target.value)} className={inputClass} placeholder="e.g. Nigeria or Ghana" />
        </label>
        <Field name="city" label="State / City" autoComplete="address-level1" />
        <GenderField />
        <Select name="ageRange" label="Age range" options={ageRanges} />
        <Field name="church" label="Church / fellowship (optional)" required={false} />
        <ControlledSelect name="learningMode" label="Preferred learning mode" options={learningModes} value={learningMode} onChange={setLearningMode} />
        <ControlledSelect name="skillPathway" label="Skill pathway of interest" options={skillPathways} value={skillPathway} onChange={setSkillPathway} />
        <TextArea name="reason" label="Why do you want to join REALMS Institute?" />
        <TextArea name="referralSource" label="How did you hear about REALMS Institute?" />
      </div>

      {isInternationalPhysical ? <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-900">Physical attendance is currently designed for students who can attend onsite. International students should select Online unless they are physically available for onsite classes.</p> : null}

      <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-[#f7f5ef] p-4 text-sm leading-6 text-slate-700">
        <input required name="consent" type="checkbox" className="mt-1 size-4 accent-[#a47720]" />
        <span>I understand that REALMS Institute is a formation program requiring participation, assignments, prayer, and accountability.</span>
      </label>

      <div className="rounded-2xl border border-[#d7aa45]/35 bg-[#071327] p-5 text-white">
        <p className="text-sm font-semibold text-[var(--realm-gold-soft)]">Registration and Cohort Participation Fee</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <Summary label="Learning Mode" value={learningMode || "Not selected"} />
          <Summary label="Skill Pathway" value={skillPathway || "Not selected"} />
          {learningMode === "Online" ? <Summary label="Country" value={country || "Not entered"} /> : null}
          <Summary label="Amount" value={fee?.display || "Select your options"} />
        </dl>
        <p className="mt-5 border-t border-white/10 pt-4 text-sm leading-6 text-white/65">Secure checkout is handled by Paystack. REALMS Institute does not collect your card details.</p>
      </div>

      <p id="registration-note" className="text-sm leading-6 text-slate-600">Payment confirms your registration interest and allows REALMS Institute to process your application for the next cohort. Admission/onboarding details will be communicated after review.</p>
      <p id="pricing-note" className="text-sm leading-6 text-slate-600">The applicable fee is Physical: ₦10,000, Online Nigeria: ₦15,000, or International Online: $20.</p>
      {error ? <p id="registration-error" role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p> : <span id="registration-error" />}
      <PrimaryButton type="submit" disabled={loading || !fee} className="w-full sm:w-fit" showIcon>
        {loading ? "Preparing secure payment..." : fee ? `Pay ${fee.display} and Submit Application` : "Select Options to Continue"}
      </PrimaryButton>
    </form>
  );
}

function Field({ name, label, type = "text", autoComplete, required = true }: { name: string; label: string; type?: string; autoComplete?: string; required?: boolean }) {
  return <label className="grid gap-2 text-sm font-semibold text-slate-800"><span>{label}</span><input required={required} name={name} id={name} type={type} autoComplete={autoComplete} className={inputClass} /></label>;
}
function Select({ name, label, options }: { name: string; label: string; options: readonly string[] }) {
  return <label className="grid gap-2 text-sm font-semibold text-slate-800"><span>{label}</span><select required defaultValue="" name={name} id={name} className={inputClass}><option value="" disabled>Select an option</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}
function GenderField() {
  return <fieldset className="grid gap-2"><legend className="text-sm font-semibold text-slate-800">Gender</legend><div className="flex min-h-12 items-center gap-6 rounded-xl border border-slate-300 bg-white px-4">{genderOptions.map((option) => <label key={option} className="flex items-center gap-2 text-sm font-medium text-slate-800"><input required name="gender" value={option} type="radio" className="size-4 accent-[#a47720]" />{option}</label>)}</div></fieldset>;
}
function ControlledSelect({ name, label, options, value, onChange }: { name: string; label: string; options: readonly string[]; value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-2 text-sm font-semibold text-slate-800"><span>{label}</span><select required value={value} onChange={(event) => onChange(event.target.value)} name={name} id={name} className={inputClass}><option value="" disabled>Select an option</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}
function TextArea({ name, label }: { name: string; label: string }) {
  return <label className="grid gap-2 text-sm font-semibold text-slate-800"><span>{label}</span><textarea required name={name} id={name} rows={5} className={`${inputClass} py-3`} /></label>;
}
function Summary({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-white/55">{label}</dt><dd className="mt-1 font-semibold text-white">{value}</dd></div>;
}
