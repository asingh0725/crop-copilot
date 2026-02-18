import { HeroSection } from "@/components/landing/hero";
import { TrustBar } from "@/components/landing/trust-bar";
import dynamic from "next/dynamic";

const ProblemSection = dynamic(() =>
  import("@/components/landing/problem-section").then((m) => ({ default: m.ProblemSection }))
);
const SolutionSection = dynamic(() =>
  import("@/components/landing/solution-section").then((m) => ({ default: m.SolutionSection }))
);
const HowAIWorksSection = dynamic(() =>
  import("@/components/landing/how-ai-works-section").then((m) => ({ default: m.HowAIWorksSection }))
);
const FeaturesSection = dynamic(() =>
  import("@/components/landing/features-section").then((m) => ({ default: m.FeaturesSection }))
);
const TestimonialsSection = dynamic(() =>
  import("@/components/landing/testimonials-section").then((m) => ({ default: m.TestimonialsSection }))
);
const PricingSection = dynamic(() =>
  import("@/components/landing/pricing-section").then((m) => ({ default: m.PricingSection }))
);

export default function LandingPage() {
  return (
    <>
      <HeroSection />
      <TrustBar />
      <ProblemSection />
      <SolutionSection />
      <HowAIWorksSection />
      <FeaturesSection />
      <TestimonialsSection />
      <PricingSection />
    </>
  );
}
