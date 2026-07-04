import { Quote } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { testimonials } from "@/lib/constants";

type TestimonialsProps = {
  id?: string;
  title?: string;
  subtitle?: string;
  showAll?: boolean;
};

export function Testimonials({
  id = "testimonials",
  title = "First Cohort Testimonies",
  subtitle = "Hear from participants in the first School of Discovery cohort.",
  showAll = false,
}: TestimonialsProps) {
  const titleId = `${id}-title`;
  const visibleTestimonials = showAll ? testimonials : testimonials.slice(0, 3);

  return (
    <section id={id} aria-labelledby={titleId} className="bg-[#f7f5ef] px-5 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-7xl">
        <Badge className="border-[#a47720]/25 bg-[#a47720]/8 text-[#7a5718]">First Cohort</Badge>
        <h2 id={titleId} className="mt-5 max-w-4xl text-3xl font-semibold tracking-tight text-[#071327] md:text-5xl">{title}</h2>
        <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600 md:text-lg">{subtitle}</p>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {visibleTestimonials.map((testimonial) => (
            <figure key={testimonial.name} className="flex min-h-72 flex-col rounded-2xl border border-slate-200 border-t-[#b8882f] bg-white p-6 shadow-[0_14px_40px_rgba(5,13,28,0.06)] md:p-8">
              <Quote aria-hidden="true" className="size-7 text-[#a47720]" />
              <blockquote className="mt-6 flex-1 text-base leading-8 text-slate-700">“{testimonial.quote}”</blockquote>
              <figcaption className="mt-7 border-t border-slate-100 pt-5">
                <p className="font-semibold text-[#071327]">{testimonial.name}</p>
                <p className="mt-1 text-sm text-slate-600">{testimonial.location}</p>
                <p className="mt-1 text-sm text-slate-500">{testimonial.role}</p>
              </figcaption>
            </figure>
          ))}
        </div>
        {!showAll ? (
          <Link
            href="/schools/discovery#discovery-testimonials"
            className="mt-8 inline-flex rounded-lg text-sm font-semibold text-[#7a5718] underline decoration-[#b8882f]/45 underline-offset-4 transition-colors hover:text-[#071327] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#a47720]"
          >
            View More Testimonies
          </Link>
        ) : null}
        <p className="mt-7 text-sm italic leading-6 text-slate-500">Testimonies have been lightly edited for clarity and privacy.</p>
      </div>
    </section>
  );
}
