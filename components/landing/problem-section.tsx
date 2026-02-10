"use client";

import { Clock, DollarSign, FileQuestion, TrendingDown } from "lucide-react";
import { motion } from "framer-motion";
import { MotionDiv, MotionStagger, staggerItem } from "./motion-wrapper";

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
    <section className="py-20 lg:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <MotionDiv className="text-center mb-16">
          <span className="inline-block px-4 py-1.5 bg-red-100 text-red-700 rounded-full text-sm font-medium mb-4">
            The Problem
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
            The Old Way Doesn&apos;t Work
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Traditional soil analysis is slow, expensive, and leaves farmers
            guessing about the best course of action.
          </p>
        </MotionDiv>

        <MotionStagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {problems.map((problem, index) => (
            <motion.div
              key={index}
              variants={staggerItem}
              className="group p-6 bg-gray-50 rounded-2xl border border-gray-100 hover:border-red-200 hover:bg-red-50/50 hover:scale-[1.02] transition-all duration-300"
            >
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-red-200 transition-colors">
                <problem.icon className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {problem.title}
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                {problem.description}
              </p>
            </motion.div>
          ))}
        </MotionStagger>
      </div>
    </section>
  );
}
