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
import { getPublicRegistrationState } from "@/lib/registrationControl.server";

export const metadata: Metadata = {
  title: "REALMS Institute | Christian Formation & Skill Equipping",
  description: "Explore REALMS School of Discovery: one approved discipleship route alongside Web Development or Cybersecurity Foundations.",
};

export default async function Home() {
  await connection();
  const registration = await getPublicRegistrationState();
  const registrationOpen = registration.kind === "open";
  const cohortName = registration.cohort?.name;
  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar registrationOpen={registrationOpen} />
      <main className="flex-1">
        <Hero registrationOpen={registrationOpen} cohortName={cohortName} />
        <ImpactStrip />
        <Vision />
        <Journey />
        <Schools />
        <FeaturedSchool />
        <Testimonials />
        <FormationModel />
        <Cohort registrationOpen={registrationOpen} cohortName={cohortName} />
        <Spheres />
        <FinalCTA registrationOpen={registrationOpen} cohortName={cohortName} />
      </main>
      <Footer />
    </div>
  );
}
import type { Metadata } from "next";
import { connection } from "next/server";
