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
      "Simply upload your existing soil test report — PDF, image, or enter values manually.",
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
    <section id="how-it-works" className="py-20 lg:py-28 bg-earth-900 relative overflow-hidden">
      {/* Diagonal gradient overlay */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background:
            "linear-gradient(135deg, rgba(250,250,245,0.05) 0%, transparent 50%, rgba(35,77,46,0.1) 100%)",
        }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <MotionDiv className="text-center mb-16">
          <span className="inline-block glass rounded-full px-4 py-1.5 text-lime-400 text-sm font-medium mb-4">
            The Solution
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
            How Crop Copilot{" "}
            <span className="font-serif italic text-gradient">Works</span>
          </h2>
          <p className="text-lg text-white/50 max-w-2xl mx-auto">
            Get expert-level recommendations in seconds, not weeks. Here&apos;s
            how simple it is.
          </p>
        </MotionDiv>

        <div className="relative">
          {/* Connection line for desktop */}
          <div className="hidden lg:block absolute top-24 left-[12.5%] right-[12.5%] h-0.5">
            <div className="w-full h-full bg-white/10 rounded-full" />
            <motion.div
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-lime-400/60 to-lime-400/20 rounded-full"
              initial={{ width: 0 }}
              whileInView={{ width: "100%" }}
              viewport={{ once: true }}
              transition={{ duration: 1.5, delay: 0.5, ease: "easeOut" }}
            />
          </div>

          <MotionStagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step, index) => (
              <motion.div key={index} variants={staggerItem} className="relative">
                <div className="glass rounded-2xl p-6 hover:bg-white/[0.12] transition-all duration-300 h-full group">
                  <div className="relative z-10 w-14 h-14 rounded-2xl flex items-center justify-center mb-5 mx-auto lg:mx-0 bg-lime-400/10 border border-lime-400/20 group-hover:bg-lime-400/20 group-hover:border-lime-400/40 transition-colors">
                    <step.icon className="w-7 h-7 text-lime-400" />
                  </div>

                  <div className="text-center lg:text-left">
                    <span className="text-lime-400 font-bold text-sm">
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
