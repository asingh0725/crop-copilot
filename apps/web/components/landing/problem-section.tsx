"use client";

import { Clock, DollarSign, FileQuestion, TrendingDown } from "lucide-react";
import { motion } from "framer-motion";
import { MotionDiv, MotionStagger, staggerItem } from "./motion-wrapper";

const stats = [
  { value: "2-3", suffix: "weeks", label: "Average wait for soil results" },
  { value: "$200-500", suffix: "", label: "Per agronomist consultation" },
  { value: "40%", suffix: "", label: "Of fertilizer is misapplied" },
];

const problems = [
  {
    icon: Clock,
    title: "Weeks of Waiting",
    description:
      "Traditional soil analysis takes 2-3 weeks to get results back from the lab.",
  },
  {
    icon: DollarSign,
    title: "Expensive Consultations",
    description:
      "Professional agronomist consultations can cost $200-500 per visit.",
  },
  {
    icon: FileQuestion,
    title: "Confusing Reports",
    description:
      "Lab results come with numbers but no clear action plan for your specific crops.",
  },
  {
    icon: TrendingDown,
    title: "Yield Uncertainty",
    description:
      "Without expert guidance, farmers often over or under-apply fertilizers.",
  },
];

export function ProblemSection() {
  return (
    <section className="relative overflow-hidden bg-earth-900 py-20 lg:py-28">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-16 top-[-24%] h-[480px] w-[480px] rounded-full bg-amber-warm/12 blur-[110px]" />
        <div className="absolute -right-20 bottom-[-20%] h-[520px] w-[520px] rounded-full bg-lime-400/10 blur-[110px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <MotionDiv className="text-center mb-16">
          <span className="mb-4 inline-block rounded-full border border-white/10 bg-white/[0.07] px-4 py-1.5 text-sm font-medium text-amber-100">
            The Problem
          </span>
          <h2 className="mb-6 text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
            The Old Way{" "}
            <span className="font-serif italic text-amber-warm">Doesn&apos;t</span>{" "}
            Work
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-white/60">
            Traditional soil analysis is slow, expensive, and leaves farmers
            guessing about the best course of action.
          </p>
        </MotionDiv>

        {/* Stats counters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="grid max-w-2xl grid-cols-3 gap-8 mx-auto mb-16"
        >
          {stats.map((stat, i) => (
            <div key={i} className="text-center">
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15, type: "spring", stiffness: 200 }}
                className="text-2xl font-bold text-amber-warm sm:text-3xl"
              >
                {stat.value}
                {stat.suffix && (
                  <span className="ml-1 text-lg font-normal text-amber-100/80">
                    {stat.suffix}
                  </span>
                )}
              </motion.div>
              <p className="mt-1 text-xs text-white/[0.45] sm:text-sm">{stat.label}</p>
            </div>
          ))}
        </motion.div>

        <MotionStagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {problems.map((problem, index) => (
            <motion.div
              key={index}
              variants={staggerItem}
              className="group rounded-2xl border border-white/12 bg-white/[0.08] p-6 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-amber-100/40 hover:bg-white/[0.12]"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.08] transition-colors group-hover:bg-amber-warm/20">
                <problem.icon className="h-6 w-6 text-amber-100" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-white">
                {problem.title}
              </h3>
              <p className="text-sm leading-relaxed text-white/60">
                {problem.description}
              </p>
            </motion.div>
          ))}
        </MotionStagger>
      </div>
    </section>
  );
}
