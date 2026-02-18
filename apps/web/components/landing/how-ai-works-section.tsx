"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Globe, Scissors, Database, Search, MessageSquare } from "lucide-react";
import { Float, MotionStagger, staggerItem } from "./motion-wrapper";

const steps = [
  {
    icon: Globe,
    title: "Gather",
    description:
      "We ingest university research, extension guides, and regional trial data.",
  },
  {
    icon: Scissors,
    title: "Chunk",
    description:
      "Documents are split into agronomy-aware chunks that preserve treatment context.",
  },
  {
    icon: Database,
    title: "Embed",
    description:
      "Each chunk becomes a vector signature in a retrieval-ready knowledge layer.",
  },
  {
    icon: Search,
    title: "Retrieve",
    description:
      "Your field input triggers semantic search to pull the most relevant evidence.",
  },
  {
    icon: MessageSquare,
    title: "Generate",
    description:
      "The model writes recommendations with cited sources and crop-specific actions.",
  },
];

export function HowAIWorksSection() {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStep((previous) => (previous + 1) % steps.length);
    }, 1800);

    return () => clearInterval(timer);
  }, []);

  return (
    <section
      id="how-it-works"
      className="relative overflow-hidden border-t border-white/10 bg-earth-950 py-24 lg:py-32"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-[-16%] h-[520px] w-[520px] rounded-full bg-amber-warm/12 blur-[120px]" />
        <div className="absolute -right-20 bottom-[-22%] h-[520px] w-[520px] rounded-full bg-lime-400/10 blur-[110px]" />
        <div className="topo-pattern absolute inset-0 opacity-[0.07]" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <MotionStagger className="mb-16 text-center">
          <motion.span
            variants={staggerItem}
            custom={0}
            className="mb-5 inline-block rounded-full border border-white/10 bg-white/[0.07] px-4 py-1.5 text-sm font-medium text-lime-200"
          >
            Recommendation pipeline
          </motion.span>
          <motion.h2
            variants={staggerItem}
            custom={1}
            className="mb-6 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl"
          >
            Research Flows Through a
            <span className="ml-3 font-serif italic text-transparent bg-clip-text bg-[linear-gradient(120deg,#f5c76d_8%,#a3e635_48%,#dff3a8_95%)]">
              Live Holographic Stream
            </span>
          </motion.h2>
          <motion.p
            variants={staggerItem}
            custom={2}
            className="mx-auto max-w-3xl text-lg leading-relaxed text-white/[0.65]"
          >
            Retrieval-augmented generation is visualized as a continuous signal path:
            ingest, structure, retrieve, and compose.
          </motion.p>
        </MotionStagger>

        <div className="relative">
          <div className="pointer-events-none absolute left-[8%] right-[8%] top-[4.9rem] z-0 hidden items-center gap-2 lg:flex">
            {steps.slice(0, -1).map((_, index) => (
              <div
                key={`connector-${index}`}
                className="relative h-[2px] flex-1 overflow-hidden rounded-full bg-gradient-to-r from-white/10 via-white/20 to-white/10"
              >
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-amber-warm/45 via-lime-300/70 to-amber-warm/35"
                  animate={{
                    opacity: index === activeStep ? [0.45, 1, 0.45] : [0.25, 0.5, 0.25],
                  }}
                  transition={{
                    duration: 1.1,
                    repeat: Infinity,
                    delay: index * 0.08,
                  }}
                />
                <motion.div
                  className="absolute -top-[3px] h-2.5 w-2.5 rounded-full bg-lime-200 shadow-[0_0_16px_rgba(217,249,157,0.95)]"
                  animate={{ x: ["-8%", "105%"] }}
                  transition={{
                    duration: 1.8,
                    repeat: Infinity,
                    delay: index * 0.2,
                    ease: "linear",
                  }}
                />
              </div>
            ))}
          </div>

          <MotionStagger className="relative z-10 grid gap-5 lg:grid-cols-5 lg:gap-4" staggerDelay={0.1}>
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === activeStep;

              return (
                <Float
                  key={step.title}
                  amplitude={index % 2 === 0 ? 5 : 7}
                  delay={index * 0.13}
                  className="h-full"
                >
                  <motion.article
                    variants={staggerItem}
                    custom={index}
                    className={`relative h-full rounded-[22px] border p-5 backdrop-blur-2xl transition-all duration-500 ${
                      isActive
                        ? "border-lime-300/35 bg-white/[0.12] shadow-[0_0_35px_rgba(163,230,53,0.22)]"
                        : "border-white/12 bg-white/[0.07]"
                    }`}
                  >
                    <div
                      className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border ${
                        isActive
                          ? "border-lime-300/50 bg-lime-300/25 text-lime-100"
                          : "border-white/15 bg-white/10 text-white/70"
                      }`}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <p className="mb-2 text-xs uppercase tracking-[0.16em] text-lime-100/[0.65]">
                      Stage {index + 1}
                    </p>
                    <h3 className="mb-2 text-xl font-semibold text-white">{step.title}</h3>
                    <p className="text-sm leading-relaxed text-white/[0.65]">{step.description}</p>
                  </motion.article>
                </Float>
              );
            })}
          </MotionStagger>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.3 }}
          className="mt-14 flex justify-center"
        >
          <div className="rounded-full border border-white/12 bg-white/[0.08] px-6 py-3 text-sm text-lime-100/80 backdrop-blur-xl">
            <span className="mr-2 font-mono text-lime-300">RAG.STREAM</span>
            Evidence remains attached to every generated recommendation.
          </div>
        </motion.div>
      </div>
    </section>
  );
}
