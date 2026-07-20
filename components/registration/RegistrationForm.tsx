"use client";

import { useState, type FormEvent } from "react";

import { PrimaryButton } from "@/components/ui/Button";
import {
  advancedDiscipleshipCourses,
  ageRanges,
  applicantTypeOptions,
  computerRequirementShort,
  computerRequirementText,
  contactEmail,
  feeClarification,
  feeLabel,
  feePolicyNote,
  feePricingNote,
  genderOptions,
  learningModes,
  physicalAddress,
  skillPathways,
} from "@/lib/constants";
import { foundationalScreeningQuestions, foundationalScreeningShortAnswers } from "@/lib/foundationalScreeningQuestions";
import { calculateCohortFee, type ApplicantType } from "@/lib/registration";

const inputClass = "min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none placeholder:text-slate-400 focus:border-[#a47720] focus:ring-2 focus:ring-[#d7aa45]/20";

export function RegistrationForm() {
  const [applicantType, setApplicantType] = useState<ApplicantType | "">("");
  const [country, setCountry] = useState("");
  const [learningMode, setLearningMode] = useState("");
  const [skillPathway, setSkillPathway] = useState("");
  const [fundingRoute, setFundingRoute] = useState<"self_pay" | "scholarship_request">("self_pay");
  const [scholarshipCanContribute, setScholarshipCanContribute] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fee = calculateCohortFee({ country, learningMode });
  const publicFeeDisplay = fee && "publicDisplay" in fee ? fee.publicDisplay : fee?.display;
  const showAmountToPay = Boolean(fee && publicFeeDisplay && publicFeeDisplay !== fee.display);
  const isInternationalPhysical = Boolean(country.trim()) && country.trim().toLowerCase() !== "nigeria" && learningMode === "Physical";
  const isAdvancedApplicant = applicantType === "realms_alumnus" || applicantType === "prior_theological_education";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!applicantType) return setError("Please select the applicant type that best describes you.");
    if (!fee) return setError("Please select your country and skill pathway learning mode to calculate the registration/application fee.");
    if (isInternationalPhysical) return setError("Physical attendance is currently designed for students who can attend onsite in Nigeria. Please select Online unless you have confirmed onsite availability.");

    setLoading(true);
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = Object.fromEntries(form.entries());
    payload.consent = form.get("consent") === "on";
    payload.feePolicyConsent = fundingRoute === "self_pay" && form.get("feePolicyConsent") === "on";
    payload.computerAccessConfirmed = form.get("computerAccessConfirmed") === "on";
    payload.applicantType = applicantType;
    payload.fundingRoute = fundingRoute;
    payload.scholarshipCanContribute = scholarshipCanContribute === "yes" ? true : scholarshipCanContribute === "no" ? false : null;
    payload.scholarshipContributionAmount = form.get("scholarshipContributionAmount") || null;
    if (applicantType === "prior_theological_education") {
      payload.screeningAnswers = {
        objective: foundationalScreeningQuestions.map((question) => ({ questionId: question.id, answer: String(form.get(`screening_${question.id}`) || "") })),
        shortAnswers: foundationalScreeningShortAnswers.map((question) => ({ questionId: question.id, response: String(form.get(`screening_${question.id}`) || "") })),
      };
    }

    try {
      const endpoint = fundingRoute === "scholarship_request" ? "/api/registrations/scholarship" : "/api/paystack/initialize";
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Your application could not be submitted.");
      if (fundingRoute === "scholarship_request") {
        if (!result.applicationId) throw new Error("Your application was not confirmed as saved. Please try again.");
        window.location.href = `/register/scholarship-received?application=${encodeURIComponent(result.applicationId)}`;
        return;
      }
      if (!result.authorizationUrl) throw new Error("Payment could not be started.");
      window.location.href = result.authorizationUrl;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your application could not be submitted.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-8" aria-describedby="registration-note pricing-note registration-error">
      <section className="grid gap-4">
        <SectionHeading title="Which best describes you?" copy="Select the option that accurately reflects your previous discipleship or theological education." />
        <div className="grid gap-3">
          {applicantTypeOptions.map((option) => (
            <label key={option.value} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-5 transition ${applicantType === option.value ? "border-[#a47720] bg-amber-50/60 ring-2 ring-[#d7aa45]/20" : "border-slate-200 bg-white hover:border-slate-300"}`}>
              <input required name="applicantType" type="radio" value={option.value} checked={applicantType === option.value} onChange={() => setApplicantType(option.value)} className="mt-1 size-4 accent-[#a47720]" />
              <span><span className="block font-semibold text-[#071327]">{option.label}</span><span className="mt-1 block text-sm leading-6 text-slate-600">{option.description}</span></span>
            </label>
          ))}
        </div>
      </section>

      {applicantType ? <ProgrammeSummary applicantType={applicantType} /> : null}

      {applicantType === "realms_alumnus" ? (
        <section className="grid gap-5 rounded-2xl border border-slate-200 bg-[#f7f5ef] p-5 sm:p-6">
          <SectionHeading title="Previous REALMS Participation" copy="REALMS alumni who successfully completed the foundational School of Discovery programme may be considered for the Advanced Discipleship Programme. Your previous participation will be verified before your final discipleship route is confirmed." />
          <div className="grid gap-5 md:grid-cols-2">
            <Field name="alumniPreviousCohort" label="Previous REALMS cohort" />
            <Field name="alumniPreviousEmail" label="Email used during previous cohort" type="email" autoComplete="email" />
            <Field name="alumniPreviousPhone" label="Phone / WhatsApp number used during previous cohort" type="tel" autoComplete="tel" />
            <Field name="alumniStudentId" label="REALMS Student ID, if known" required={false} />
          </div>
        </section>
      ) : null}

      {applicantType === "prior_theological_education" ? (
        <>
          <section className="grid gap-5 rounded-2xl border border-slate-200 bg-[#f7f5ef] p-5 sm:p-6">
            <SectionHeading title="Previous Theological / Discipleship Education" copy="Provide enough detail for REALMS to assess the structured training you completed outside REALMS." />
            <div className="grid gap-5 md:grid-cols-2">
              <Field name="theologicalInstitution" label="Name of theological institution / Bible school / ministry training" />
              <Field name="theologicalProgramme" label="Programme or course studied" />
              <Field name="theologicalDuration" label="Approximate duration" placeholder="e.g. 12 months" />
              <Field name="theologicalYearCompleted" label="Year completed" placeholder="e.g. 2024" />
              <div className="md:col-span-2"><Field name="theologicalQualification" label="Certificate / qualification received, if any" required={false} /></div>
            </div>
          </section>
          <ScreeningSection />
        </>
      ) : null}

      <section className="grid gap-5">
        <SectionHeading title="Your Details and Skill Pathway" copy="Every student completes one approved discipleship route and one practical skill pathway." />
        <div className="grid gap-5 md:grid-cols-2">
          <Field name="fullName" label="Full name" autoComplete="name" />
          <Field name="email" label="Email address" type="email" autoComplete="email" />
          <Field name="whatsapp" label="WhatsApp number" type="tel" autoComplete="tel" />
          <label className="grid gap-2 text-sm font-semibold text-slate-800"><span>Country</span><input required name="country" id="country" autoComplete="country-name" value={country} onChange={(event) => setCountry(event.target.value)} className={inputClass} placeholder="e.g. Nigeria or Ghana" /></label>
          <Field name="city" label="State / City" autoComplete="address-level1" />
          <GenderField />
          <Select name="ageRange" label="Age range" options={ageRanges} />
          <Field name="church" label="Church / fellowship (optional)" required={false} />
          <ControlledSelect name="skillPathway" label="Skill Pathway" options={skillPathways} value={skillPathway} onChange={setSkillPathway} />
          <ControlledSelect name="learningMode" label="Skill Pathway Learning Mode" options={learningModes} value={learningMode} onChange={setLearningMode} />
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700 md:col-span-2">Your Physical or Online selection applies to your practical skill pathway. Discipleship sessions are delivered online.</p>
          {learningMode === "Physical" ? <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700 md:col-span-2">Physical skill pathway classes/location: {physicalAddress}</p> : null}
          <div className="grid gap-3 md:col-span-2">
            <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">{computerRequirementText}</p>
            {skillPathway ? <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-900">{computerRequirementShort}</p> : null}
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-[#f7f5ef] p-4 text-sm leading-6 text-slate-700"><input required name="computerAccessConfirmed" type="checkbox" className="mt-1 size-4 accent-[#a47720]" /><span>I confirm that I have access to a laptop or desktop computer for the skill pathway.</span></label>
          </div>
          <TextArea name="reason" label="Why do you want to join REALMS Institute?" />
          <TextArea name="referralSource" label="How did you hear about REALMS Institute?" />
        </div>
      </section>

      {isInternationalPhysical ? <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-900">Physical attendance is currently designed for students who can attend onsite. International students should select Online unless they are physically available for onsite classes.</p> : null}

      <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-[#f7f5ef] p-4 text-sm leading-6 text-slate-700"><input required name="consent" type="checkbox" className="mt-1 size-4 accent-[#a47720]" /><span>I understand that REALMS Institute is a formation programme requiring participation, assignments, prayer, and accountability.</span></label>

      <section className="grid gap-4 rounded-2xl border border-[#d7aa45]/45 bg-amber-50/50 p-5 sm:p-6">
        <SectionHeading title="Need Help With the Registration Fee?" copy="If you genuinely cannot afford the registration/application fee, you may request scholarship support. Support is limited and subject to review. A scholarship request does not guarantee funding or admission." />
        <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-white p-4 text-sm font-semibold leading-6 text-[#071327]"><input name="requestScholarship" type="checkbox" checked={fundingRoute === "scholarship_request"} onChange={(event) => setFundingRoute(event.target.checked ? "scholarship_request" : "self_pay")} className="mt-1 size-4 accent-[#a47720]" /><span>I would like to request scholarship support</span></label>
        {fundingRoute === "scholarship_request" ? (
          <div className="grid gap-5">
            <TextArea name="scholarshipReason" label="Why are you requesting scholarship support?" />
            <TextArea name="scholarshipFinancialSituation" label="Briefly describe your current financial situation." />
            <fieldset className="grid gap-2"><legend className="text-sm font-semibold text-slate-800">Are you able to contribute any part of the registration fee?</legend><div className="flex min-h-12 items-center gap-6 rounded-xl border border-slate-300 bg-white px-4">{["yes", "no"].map((value) => <label key={value} className="flex items-center gap-2 text-sm font-medium text-slate-800"><input required name="scholarshipCanContribute" value={value} checked={scholarshipCanContribute === value} onChange={() => setScholarshipCanContribute(value)} type="radio" className="size-4 accent-[#a47720]" />{value === "yes" ? "Yes" : "No"}</label>)}</div></fieldset>
            {scholarshipCanContribute === "yes" ? <Field name="scholarshipContributionAmount" label="How much are you able to contribute?" type="number" min="1" max={fee ? String(fee.amount) : undefined} placeholder="Amount in naira (₦)" /> : null}
          </div>
        ) : null}
      </section>

      <div className="rounded-2xl border border-[#d7aa45]/35 bg-[#071327] p-5 text-white">
        <p className="text-sm font-semibold text-[var(--realm-gold-soft)]">Registration Summary</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <Summary label="Applicant Type" value={applicantTypeOptions.find((option) => option.value === applicantType)?.label || "Not selected"} />
          <Summary label="Requested Discipleship Route" value={applicantType ? (isAdvancedApplicant ? "Advanced Discipleship Programme" : "Foundational Discipleship Programme") : "Not selected"} />
          <Summary label="Skill Pathway" value={skillPathway || "Not selected"} />
          <Summary label="Skill Pathway Learning Mode" value={learningMode || "Not selected"} />
          <Summary label="Country" value={country || "Not entered"} />
          <Summary label="Registration/Application Fee" value={publicFeeDisplay || "Select your options"} />
          {showAmountToPay ? <Summary label="Paystack Amount" value={fee?.display || "Select your options"} /> : null}
          <Summary label="Funding Route" value={fundingRoute === "scholarship_request" ? "Scholarship request — subject to review" : "Self-pay"} />
        </dl>
        {isAdvancedApplicant ? <p className="mt-5 border-t border-white/10 pt-4 text-sm leading-6 text-white/75">Advanced Discipleship includes all five advanced courses.</p> : null}
        {fundingRoute === "self_pay" ? <p className="mt-3 text-sm leading-6 text-white/65">Secure checkout is handled by Paystack. REALMS Institute does not collect your card details.</p> : <p className="mt-3 text-sm leading-6 text-white/65">Your request will be saved for review. You will not be sent to Paystack at this stage.</p>}
      </div>

      {fundingRoute === "self_pay" ? (
        <>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950"><p className="font-semibold text-[#071327]">Payment Notice</p><ul className="mt-3 grid gap-2"><li>This is a non-refundable registration/application fee.</li><li>Payment does not mean automatic admission.</li><li>REALMS Institute will review your application and confirm your approved discipleship route and admission/onboarding status.</li><li>{feeClarification}</li><li>Please ensure your details are correct before proceeding to payment.</li></ul></div>
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-[#f7f5ef] p-4 text-sm leading-6 text-slate-700"><input required name="feePolicyConsent" type="checkbox" className="mt-1 size-4 accent-[#a47720]" /><span>I understand that the registration/application fee is non-refundable, that payment does not guarantee admission, and that REALMS Institute will review my application before confirming my approved discipleship route and admission/onboarding details.</span></label>
        </>
      ) : <p className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">Scholarship support is subject to review and availability. A scholarship request does not guarantee funding or admission.</p>}

      <p id="registration-note" className="text-sm leading-6 text-slate-600">Registration is open for the August 2026 programme. REALMS will confirm each applicant&apos;s approved discipleship route after any required eligibility verification or screening review. For help, contact {contactEmail}.</p>
      <p id="pricing-note" className="text-sm leading-6 text-slate-600">{feeLabel}: {feePricingNote} {feeClarification} {feePolicyNote}</p>
      {error ? <p id="registration-error" role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p> : <span id="registration-error" />}
      <PrimaryButton type="submit" disabled={loading || !fee || !applicantType} className="w-full sm:w-fit" showIcon>
        {loading ? (fundingRoute === "scholarship_request" ? "Submitting application..." : "Saving application and preparing payment...") : fundingRoute === "scholarship_request" ? "Submit Application & Scholarship Request" : fee ? `Pay ${fee.display} and Submit Application` : "Select Options to Continue"}
      </PrimaryButton>
    </form>
  );
}

function ProgrammeSummary({ applicantType }: { applicantType: ApplicantType }) {
  const advanced = applicantType !== "new_student";
  return <section className="rounded-2xl border border-[#d7aa45]/40 bg-[#071327] p-5 text-white sm:p-6"><p className="text-sm font-semibold uppercase tracking-wider text-[var(--realm-gold-soft)]">Programme Summary</p><h2 className="mt-2 text-2xl font-semibold">{advanced ? "Advanced Discipleship Programme" : "Foundational Discipleship Programme"}</h2>{advanced ? <><p className="mt-3 text-sm leading-6 text-white/75">Requested Discipleship Route: Advanced Discipleship Programme</p><p className="mt-1 text-sm font-semibold text-[var(--realm-gold-soft)]">{applicantType === "realms_alumnus" ? "Advanced entry requested — alumni verification required." : "Advanced entry requested — screening review required."}</p><p className="mt-1 text-sm leading-6 text-white/70">Status: Subject to eligibility verification/review</p><h3 className="mt-6 font-semibold">All five advanced courses are compulsory:</h3><ol className="mt-3 grid gap-3 text-sm leading-6 text-white/80">{advancedDiscipleshipCourses.map((course) => <li key={course.code}><span className="font-semibold text-white">{course.code}</span><br />{course.title}</li>)}</ol><div className="mt-6 border-t border-white/10 pt-4 text-sm leading-6 text-white/75"><p className="font-semibold text-white">Schedule</p><p>Monday–Wednesday<br />7:00 PM–9:00 PM<br />Online</p></div></> : <div className="mt-4 grid gap-2 text-sm leading-6 text-white/75"><p><span className="font-semibold text-white">Discipleship Route:</span><br />Foundational Discipleship Programme</p><p><span className="font-semibold text-white">Skill Pathway:</span><br />Choose Web Development or Cybersecurity Foundations.</p></div>}</section>;
}

function ScreeningSection() {
  return <section className="grid gap-6 rounded-2xl border border-[#d7aa45]/45 bg-white p-5 sm:p-6"><SectionHeading title="Foundational Knowledge Screening" copy="The Advanced Discipleship Programme builds on foundational Christian doctrine and formation. Applicants who did not complete the REALMS foundational programme will complete this screening to help REALMS assess readiness for advanced entry. Your screening result does not automatically guarantee advanced placement. REALMS will review your responses and confirm whether you will enter the Foundational or Advanced Discipleship route." /><p className="rounded-xl border border-slate-200 bg-[#f7f5ef] p-4 text-sm leading-6 text-slate-700">The objective section is scored server-side out of 50. Long-answer responses require academic review. The form will not display a pass or fail result.</p>{foundationalScreeningQuestions.map((question, index) => <fieldset key={question.id} className="grid gap-3 border-t border-slate-200 pt-5"><legend className="font-semibold leading-6 text-[#071327]">{index + 1}. {question.question}</legend><div className="grid gap-2">{question.options.map((option) => <label key={option.value} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm leading-6 text-slate-700"><input required name={`screening_${question.id}`} value={option.value} type="radio" className="mt-1 size-4 shrink-0 accent-[#a47720]" /><span><span className="font-semibold text-[#071327]">{option.value}.</span> {option.label}</span></label>)}</div></fieldset>)}{foundationalScreeningShortAnswers.map((question, index) => <label key={question.id} className="grid gap-2 border-t border-slate-200 pt-5 text-sm font-semibold text-slate-800"><span>Long Answer {index + 1}: {question.question}</span><span className="font-normal text-slate-500">Recommended length: {question.recommendedLength}</span><textarea required name={`screening_${question.id}`} rows={8} className={`${inputClass} py-3`} /></label>)}</section>;
}

function SectionHeading({ title, copy }: { title: string; copy: string }) { return <div><h2 className="text-xl font-semibold text-[#071327]">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{copy}</p></div>; }
function Field({ name, label, type = "text", autoComplete, required = true, placeholder, min, max }: { name: string; label: string; type?: string; autoComplete?: string; required?: boolean; placeholder?: string; min?: string; max?: string }) { return <label className="grid gap-2 text-sm font-semibold text-slate-800"><span>{label}</span><input required={required} name={name} id={name} type={type} autoComplete={autoComplete} placeholder={placeholder} min={min} max={max} className={inputClass} /></label>; }
function Select({ name, label, options }: { name: string; label: string; options: readonly string[] }) { return <label className="grid gap-2 text-sm font-semibold text-slate-800"><span>{label}</span><select required defaultValue="" name={name} id={name} className={inputClass}><option value="" disabled>Select an option</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>; }
function GenderField() { return <fieldset className="grid gap-2"><legend className="text-sm font-semibold text-slate-800">Gender</legend><div className="flex min-h-12 items-center gap-6 rounded-xl border border-slate-300 bg-white px-4">{genderOptions.map((option) => <label key={option} className="flex items-center gap-2 text-sm font-medium text-slate-800"><input required name="gender" value={option} type="radio" className="size-4 accent-[#a47720]" />{option}</label>)}</div></fieldset>; }
function ControlledSelect({ name, label, options, value, onChange }: { name: string; label: string; options: readonly string[]; value: string; onChange: (value: string) => void }) { return <label className="grid gap-2 text-sm font-semibold text-slate-800"><span>{label}</span><select required value={value} onChange={(event) => onChange(event.target.value)} name={name} id={name} className={inputClass}><option value="" disabled>Select an option</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>; }
function TextArea({ name, label }: { name: string; label: string }) { return <label className="grid gap-2 text-sm font-semibold text-slate-800"><span>{label}</span><textarea required name={name} id={name} rows={5} className={`${inputClass} py-3`} /></label>; }
function Summary({ label, value }: { label: string; value: string }) { return <div><dt className="text-white/55">{label}</dt><dd className="mt-1 font-semibold text-white">{value}</dd></div>; }
