"use client";

import { motion } from "framer-motion";
import {
  Globe,
  Scissors,
  Database,
  Search,
  MessageSquare,
  ArrowDown,
} from "lucide-react";
import { MotionDiv, MotionStagger, staggerItem } from "./motion-wrapper";

const steps = [
  {
    icon: Globe,
    title: "We Gather Research",
    description:
      "We collect published research papers, extension guides, and field trial data from university agricultural departments across North America.",
  },
  {
    icon: Scissors,
    title: "We Break It Into Pieces",
    description:
      "Each document is intelligently split into focused, digestible chunks — preserving tables, nutrient data, and treatment protocols intact.",
  },
  {
    icon: Database,
    title: "We Make It Searchable",
    description:
      "Every chunk is converted into a mathematical fingerprint (an embedding) and stored in a specialized database that understands meaning, not just keywords.",
  },
  {
    icon: Search,
    title: "We Find What Matters",
    description:
      "When you submit a diagnosis, we search this knowledge base to find the most relevant research for your specific crop, region, and symptoms.",
  },
  {
    icon: MessageSquare,
    title: "AI Writes Your Answer",
    description:
      "Our AI reads the matched research and writes a clear recommendation — always citing which sources it used so you can verify.",
  },
];

export function HowAIWorksSection() {
  return (
    <section className="py-20 lg:py-28 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <MotionDiv className="text-center mb-16">
          <span className="inline-block px-4 py-1.5 bg-[#76C043]/10 text-[#2C5F2D] rounded-full text-sm font-medium mb-4">
            Under the Hood
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
            How Our AI{" "}
            <span className="font-serif italic text-hero-accent">Learns</span>{" "}
            Agriculture
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            We don&apos;t just ask AI to guess. We feed it real research from
            real universities — then make it cite its sources.
          </p>
        </MotionDiv>

        <MotionStagger className="max-w-3xl mx-auto space-y-0">
          {steps.map((step, index) => (
            <motion.div key={index} variants={staggerItem}>
              <div className="flex gap-5 items-start">
                {/* Timeline */}
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-12 h-12 rounded-xl bg-white border-2 border-hero-accent/20 flex items-center justify-center shadow-sm">
                    <step.icon className="w-5 h-5 text-hero-accent" />
                  </div>
                  {index < steps.length - 1 && (
                    <div className="w-px h-8 bg-gradient-to-b from-hero-accent/30 to-hero-accent/5 my-1" />
                  )}
                </div>

                {/* Content */}
                <div className="pb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1.5">
                    {step.title}
                  </h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </MotionStagger>

        <MotionDiv delay={0.3} className="text-center mt-10">
          <p className="text-sm text-gray-500 max-w-lg mx-auto">
            This approach is called Retrieval-Augmented Generation (RAG). It
            means our AI never makes things up — it always works from real,
            published research.
          </p>
        </MotionDiv>
      </div>
    </section>
  );
}
