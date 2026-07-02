import { Quote } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { testimonials } from "@/lib/constants";

type TestimonialsProps = {
  id?: string;
  title?: string;
  subtitle?: string;
};

export function Testimonials({
  id = "testimonials",
  title = "Voices from the First Cohort",
  subtitle = "The first School of Discovery cohort marked the beginning of a journey of formation, prayer, doctrine, calling, and practical obedience.",
}: TestimonialsProps) {
  const titleId = `${id}-title`;

  return (
    <section id={id} aria-labelledby={titleId} className="bg-[#f7f5ef] px-5 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-7xl">
        <Badge className="border-[#a47720]/25 bg-[#a47720]/8 text-[#7a5718]">First Cohort</Badge>
        <h2 id={titleId} className="mt-5 max-w-4xl text-3xl font-semibold tracking-tight text-[#071327] md:text-5xl">{title}</h2>
        <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600 md:text-lg">{subtitle}</p>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {testimonials.map((testimonial) => (
            <figure key={testimonial.name} className="flex min-h-72 flex-col rounded-2xl border border-slate-200 border-t-[#b8882f] bg-white p-6 shadow-[0_14px_40px_rgba(5,13,28,0.06)] md:p-8">
              <Quote aria-hidden="true" className="size-7 text-[#a47720]" />
              <blockquote className="mt-6 flex-1 text-base leading-8 text-slate-700">“{testimonial.quote}”</blockquote>
              <figcaption className="mt-7 border-t border-slate-100 pt-5">
                <p className="font-semibold text-[#071327]">{testimonial.name}</p>
                <p className="mt-1 text-sm text-slate-500">{testimonial.role}</p>
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-7 text-sm leading-6 text-slate-500">More verified student testimonies will be added as REALMS Institute continues to document cohort impact.</p>
      </div>
    </section>
  );
}
