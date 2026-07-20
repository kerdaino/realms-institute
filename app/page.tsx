import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { Cohort } from "@/components/sections/Cohort";
import { FeaturedSchool } from "@/components/sections/FeaturedSchool";
import { FinalCTA } from "@/components/sections/FinalCTA";
import { FormationModel } from "@/components/sections/FormationModel";
import { Hero } from "@/components/sections/Hero";
import { ImpactStrip } from "@/components/sections/ImpactStrip";
import { Journey } from "@/components/sections/Journey";
import { Schools } from "@/components/sections/Schools";
import { Spheres } from "@/components/sections/Spheres";
import { Testimonials } from "@/components/sections/Testimonials";
import { Vision } from "@/components/sections/Vision";

export const metadata: Metadata = {
  title: "REALMS Institute | Christian Formation & Skill Equipping",
  description: "Apply for the August 2026 REALMS School of Discovery: one approved discipleship route alongside Web Development or Cybersecurity Foundations.",
};

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <ImpactStrip />
        <Vision />
        <Journey />
        <Schools />
        <FeaturedSchool />
        <Testimonials />
        <FormationModel />
        <Cohort />
        <Spheres />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
import type { Metadata } from "next";
