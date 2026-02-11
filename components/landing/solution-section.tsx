"use client";

import { Upload, Cpu, FileCheck, Sprout } from "lucide-react";
import { motion } from "framer-motion";
import { MotionDiv, MotionStagger, staggerItem } from "./motion-wrapper";

const steps = [
  {
    icon: Upload,
    step: "01",
    title: "Upload Your Soil Test",
    description:
      "Simply upload your existing soil test report\u2014PDF, image, or enter values manually.",
  },
  {
    icon: Cpu,
    step: "02",
    title: "AI Analysis",
    description:
      "Our AI processes your data using university-backed research and agronomic models.",
  },
  {
    icon: FileCheck,
    step: "03",
    title: "Get Recommendations",
    description:
      "Receive personalized fertilizer recommendations with specific rates and timing.",
  },
  {
    icon: Sprout,
    step: "04",
    title: "Maximize Yield",
    description:
      "Apply with confidence knowing your recommendations are scientifically optimized.",
  },
];

export function SolutionSection() {
  return (
    <section id="how-it-works" className="py-20 lg:py-28 bg-hero-dark">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <MotionDiv className="text-center mb-16">
          <span className="inline-block glass rounded-full px-4 py-1.5 text-hero-accent text-sm font-medium mb-4">
            The Solution
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
            How AI Agronomist Works
          </h2>
          <p className="text-lg text-white/50 max-w-2xl mx-auto">
            Get expert-level recommendations in seconds, not weeks. Here&apos;s
            how simple it is.
          </p>
        </MotionDiv>

        <div className="relative">
          {/* Connection line for desktop */}
          <div className="hidden lg:block absolute top-24 left-[12.5%] right-[12.5%] h-0.5 bg-gradient-to-r from-hero-accent/20 via-hero-accent to-hero-accent/20" />

          <MotionStagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-6">
            {steps.map((step, index) => (
              <motion.div key={index} variants={staggerItem} className="relative">
                <div className="glass rounded-2xl p-6 hover:bg-white/[0.12] transition-all duration-300 h-full">
                  {/* Step icon */}
                  <div className="relative z-10 w-14 h-14 rounded-2xl flex items-center justify-center mb-5 mx-auto lg:mx-0 bg-hero-accent/20 border border-hero-accent/30">
                    <step.icon className="w-7 h-7 text-hero-accent" />
                  </div>

                  <div className="text-center lg:text-left">
                    <span className="text-hero-accent font-bold text-sm">
                      Step {step.step}
                    </span>
                    <h3 className="text-xl font-semibold text-white mt-1 mb-3">
                      {step.title}
                    </h3>
                    <p className="text-white/50 text-sm leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </MotionStagger>
        </div>
      </div>
    </section>
  );
}
