"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { HeroParticles } from "./hero-particles";
import { HeroVisual } from "./hero-visual";
import { DashboardPreview } from "./dashboard-preview";

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.12, delayChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export function HeroSection() {
  return (
    <section className="relative min-h-screen overflow-hidden">
      {/* Background layers */}
      <div className="absolute inset-0 bg-earth-950" />
      <div
        className="absolute inset-0 animate-gradient-shift opacity-50"
        style={{
          background:
            "linear-gradient(135deg, #0a1f14 0%, #1a3a2a 25%, #234d2e 50%, #1a3a2a 75%, #0a1f14 100%)",
          backgroundSize: "200% 200%",
        }}
      />
      <div className="grain-overlay absolute inset-0" />

      {/* Particles */}
      <HeroParticles />

      {/* Radial glow */}
      <motion.div
        className="absolute top-[30%] left-[30%] w-[600px] h-[600px] rounded-full opacity-20 pointer-events-none"
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.15, 0.25, 0.15],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background:
            "radial-gradient(circle, rgba(118,192,67,0.25) 0%, transparent 65%)",
        }}
      />

      {/* Main content — split layout */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 lg:pt-36 pb-16">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center min-h-[70vh]">
          {/* Left — Text */}
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="text-left"
          >
            {/* Trust badge */}
            <motion.div variants={item} className="mb-8">
              <div className="glass inline-flex rounded-full px-4 py-2 items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-lime-400" />
                <span className="text-sm text-white/70 font-medium">
                  Backed by university research
                </span>
              </div>
            </motion.div>

            {/* Headline */}
            <motion.h1
              variants={item}
              className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold text-white leading-[1.05] tracking-tight"
            >
              Turn Soil Into
              <br />
              <span className="font-serif italic text-gradient">Harvest</span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              variants={item}
              className="mt-6 text-lg sm:text-xl text-white/50 max-w-lg leading-relaxed"
            >
              AI-powered crop diagnostics grounded in peer-reviewed research.
              Answers in seconds, not days.
            </motion.p>

            {/* CTAs */}
            <motion.div
              variants={item}
              className="mt-10 flex flex-col sm:flex-row items-start gap-4"
            >
              <Button
                asChild
                size="lg"
                className="bg-lime-400 hover:bg-lime-300 text-earth-950 font-semibold text-base px-8 py-6 rounded-full transition-all hover:scale-[1.03] glow-accent"
              >
                <Link href="/signup">
                  Get Started Free
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Link>
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="glass text-white hover:bg-white/10 text-base px-8 py-6 rounded-full border-white/20"
              >
                Watch Demo
              </Button>
            </motion.div>

            <motion.p variants={item} className="mt-5 text-sm text-white/30">
              No credit card required
            </motion.p>
          </motion.div>

          {/* Right — Animated Visual */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.5, ease: "easeOut" }}
            className="hidden sm:flex h-[300px] sm:h-[400px] lg:h-[500px] xl:h-[550px] items-center justify-center"
          >
            <HeroVisual />
          </motion.div>
        </div>

        {/* Dashboard Preview — below the fold */}
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1, ease: "easeOut" }}
          className="mt-16 lg:mt-24"
          style={{ perspective: "1200px" }}
        >
          <div
            className="transform transition-transform duration-500 hover:scale-[1.01]"
            style={{
              transformStyle: "preserve-3d",
              transform: "rotateX(2deg)",
            }}
          >
            <DashboardPreview />
          </div>
        </motion.div>
      </div>

      {/* Scroll progress line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lime-400/30 to-transparent" />
    </section>
  );
}
