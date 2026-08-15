// LandingPage — composition root for "/" (no session hash).
//
// The page is structured as one grilling round: every section title is a
// question the agent would ask. Sections sit on plain canvas with whitespace
// between bands; the mesh gradient appears in the hero only.

import { DemoRound } from "../components/landing/DemoRound";
import { FinalCta } from "../components/landing/FinalCta";
import { Hero } from "../components/landing/Hero";
import { HowItWorks } from "../components/landing/HowItWorks";
import { LandingFooter } from "../components/landing/LandingFooter";
import { LandingNav } from "../components/landing/LandingNav";
import { PainSection } from "../components/landing/PainSection";
import { ReviewQuestion } from "../components/landing/ReviewQuestion";

export function LandingPage() {
  return (
    <>
      <LandingNav />
      <main>
        <Hero />
        <PainSection />
        <HowItWorks />
        <ReviewQuestion />
        <DemoRound />
        <FinalCta />
      </main>
      <LandingFooter />
    </>
  );
}
