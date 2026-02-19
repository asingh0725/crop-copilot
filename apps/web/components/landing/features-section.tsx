"use client";

import {
  Zap,
  Shield,
  BarChart3,
  Leaf,
  Cloud,
  BookOpen,
} from "lucide-react";
import { motion } from "framer-motion";
import { MotionDiv, MotionStagger, staggerItem, Float } from "./motion-wrapper";

// ... imports

const features = [
  {
    icon: Zap,
    title: "Instant Analysis",
    description:
      "Get comprehensive soil analysis and recommendations in seconds, not weeks.",
    size: "large" as const,
  },
  {
    icon: Shield,
    title: "Research-Backed",
    description:
      "All recommendations grounded in peer-reviewed university research and proven methodologies.",
    size: "large" as const,
  },
  {
    icon: BarChart3,
    title: "Cited Recommendations",
    description:
      "Every recommendation comes with citations to the university research that backs it up.",
    size: "small" as const,
  },
  {
    icon: Leaf,
    title: "Sustainable Practices",
    description:
      "Optimize nutrient application to reduce environmental impact while maximizing yield.",
    size: "small" as const,
  },
  {
    icon: Cloud,
    title: "Cloud Storage",
    description:
      "All your soil tests and recommendations securely stored and accessible anywhere.",
    size: "small" as const,
  },
  {
    icon: BookOpen,
    title: "Educational Insights",
    description:
      "Learn why each recommendation is made with detailed explanations and sources.",
    size: "small" as const,
  },
];

// ... features array remains the same

function AnimatedCounter({ target, label }: { target: number; label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      className="text-center"
    >
      <motion.span
        className="text-3xl font-bold text-lime-400 block drop-shadow-[0_0_10px_rgba(163,230,53,0.5)]"
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.2 }}
      >
        {target.toLocaleString()}+
      </motion.span>
      <span className="text-sm text-lime-100/60">{label}</span>
    </motion.div>
  );
}

export function FeaturesSection() {
  const largeFeatures = features.filter((f) => f.size === "large");
  const smallFeatures = features.filter((f) => f.size === "small");

  return (
    <section id="features" className="relative overflow-hidden bg-earth-950 py-24 lg:py-32">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-16 top-[-26%] h-[520px] w-[520px] rounded-full bg-lime-400/10 blur-[120px]" />
        <div className="absolute -left-20 bottom-[-18%] h-[520px] w-[520px] rounded-full bg-amber-warm/10 blur-[110px]" />
        <div className="topo-pattern absolute inset-0 opacity-[0.07]" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <MotionDiv className="text-center mb-16">
          <span className="mb-4 inline-block rounded-full border border-white/10 bg-white/[0.08] px-4 py-1.5 text-sm font-medium text-lime-200">
            Capabilities
          </span>
          <h2 className="mb-6 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Floating Glass Panels for{" "}
            <span className="font-serif italic text-transparent bg-clip-text bg-[linear-gradient(120deg,#f5c76d_8%,#a3e635_50%,#dff3a8_95%)]">
              Precision Decisions
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-white/[0.6]">
            Crop Copilot combines retrieval evidence, agronomy context, and automation into one
            cohesive zero-gravity control surface.
          </p>
        </MotionDiv>

        <MotionStagger className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
            {largeFeatures.map((feature, index) => (
              <Float key={index} delay={index * 0.18} amplitude={6} className="h-full">
                <MotionDiv tilt hoverScale={1.015} className="h-full">
                  <motion.div
                    variants={staggerItem}
                    custom={index}
                    className="group relative h-full overflow-hidden rounded-[28px] border border-white/12 bg-white/[0.09] p-8 backdrop-blur-2xl transition-all duration-500 hover:border-lime-300/35"
                  >
                    <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-lime-300/18 blur-[80px] opacity-0 transition-opacity duration-700 group-hover:opacity-100" />
                    <div className="relative z-10">
                      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.08]">
                        <feature.icon className="h-7 w-7 text-lime-300 drop-shadow-[0_0_10px_rgba(163,230,53,0.35)]" />
                      </div>
                      <h3 className="mb-3 text-xl font-bold tracking-tight text-white lg:text-3xl">
                        {feature.title}
                      </h3>
                      <p className="max-w-sm text-lg leading-relaxed text-white/[0.65]">
                        {feature.description}
                      </p>
                      {index === 0 && (
                        <div className="relative z-20 mt-8 flex gap-8 border-t border-white/10 pt-6">
                          <AnimatedCounter target={30} label="Second analysis" />
                          <AnimatedCounter target={500} label="Research sources" />
                        </div>
                      )}
                      {index === 1 && (
                        <div className="relative z-20 mt-8 flex gap-8 border-t border-white/10 pt-6">
                          <AnimatedCounter target={15} label="Universities" />
                          <AnimatedCounter target={4000} label="Research chunks" />
                        </div>
                      )}
                    </div>
                  </motion.div>
                </MotionDiv>
              </Float>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
            {smallFeatures.map((feature, index) => (
              <Float key={index} delay={0.5 + index * 0.08} amplitude={4} className="h-full">
                <MotionDiv tilt hoverScale={1.02} className="h-full">
                  <motion.div
                    variants={staggerItem}
                    custom={index + 2}
                    className="group z-10 h-full rounded-[24px] border border-white/12 bg-white/[0.08] p-6 backdrop-blur-2xl transition-all duration-400 hover:border-lime-300/30 hover:bg-white/[0.11]"
                  >
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-white/12 bg-white/[0.08] transition-colors duration-300 group-hover:bg-lime-300/22">
                      <feature.icon className="h-6 w-6 text-lime-300" />
                    </div>
                    <h3 className="mb-2 text-lg font-bold text-white">{feature.title}</h3>
                    <p className="text-sm leading-relaxed text-white/[0.58]">{feature.description}</p>
                  </motion.div>
                </MotionDiv>
               </Float>
            ))}
          </div>
        </MotionStagger>
      </div>
    </section>
  );
}
