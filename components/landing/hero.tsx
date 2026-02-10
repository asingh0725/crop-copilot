"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ArrowRight, ChevronDown } from "lucide-react";
import { DashboardPreview } from "./dashboard-preview";

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.15, delayChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 30 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" as const },
  },
};

function FloatingOrb({
  className,
  delay = 0,
  style,
}: {
  className: string;
  delay?: number;
  style?: React.CSSProperties;
}) {
  return (
    <motion.div
      className={`absolute rounded-full pointer-events-none ${className}`}
      style={style}
      animate={{
        y: [0, -20, 0],
        x: [0, 10, 0],
        scale: [1, 1.05, 1],
      }}
      transition={{
        duration: 8,
        repeat: Infinity,
        ease: "easeInOut",
        delay,
      }}
    />
  );
}

export function HeroSection() {
  return (
    <section className="relative min-h-screen overflow-hidden pt-24 pb-16 lg:pt-32 lg:pb-24">
      {/* Background layers */}
      <div className="absolute inset-0 bg-hero-dark" />
      <div
        className="absolute inset-0 animate-gradient-shift opacity-60"
        style={{
          background:
            "linear-gradient(135deg, #1a3a2a 0%, #2C5F2D 25%, #1a4a30 50%, #234d2e 75%, #1a3a2a 100%)",
          backgroundSize: "200% 200%",
        }}
      />
      {/* Grain overlay */}
      <div className="grain-overlay absolute inset-0" />

      {/* Animated floating orbs */}
      <FloatingOrb
        className="top-[15%] left-[10%] w-[300px] h-[300px] opacity-[0.07]"
        style={{
          background:
            "radial-gradient(circle, rgba(118,192,67,0.5) 0%, transparent 70%)",
        }}
        delay={0}
      />
      <FloatingOrb
        className="top-[60%] right-[5%] w-[400px] h-[400px] opacity-[0.05]"
        style={{
          background:
            "radial-gradient(circle, rgba(118,192,67,0.4) 0%, transparent 70%)",
        }}
        delay={3}
      />
      <FloatingOrb
        className="bottom-[20%] left-[20%] w-[250px] h-[250px] opacity-[0.06]"
        style={{
          background:
            "radial-gradient(circle, rgba(44,95,45,0.6) 0%, transparent 70%)",
        }}
        delay={5}
      />

      {/* Radial glow behind content */}
      <motion.div
        className="absolute top-[20%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-15"
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.15, 0.2, 0.15],
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{
          background:
            "radial-gradient(circle, rgba(118,192,67,0.3) 0%, transparent 60%)",
        }}
      />

      {/* Content */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center"
      >
        {/* Trust badge */}
        <motion.div variants={item} className="flex justify-center mb-8">
          <div className="glass rounded-full px-5 py-2.5 flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-hero-accent" />
            <span className="text-sm text-white/80 font-medium">
              Research-backed by leading agricultural universities
            </span>
          </div>
        </motion.div>

        {/* Headline */}
        <motion.h1
          variants={item}
          className="text-4xl sm:text-5xl lg:text-6xl xl:text-[80px] font-bold text-white leading-[1.1] tracking-tight"
        >
          Turn Soil Data Into
          <br />
          <span className="font-serif italic text-hero-accent">Harvest</span>{" "}
          Success
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          variants={item}
          className="mt-6 text-lg sm:text-xl text-white/60 max-w-2xl mx-auto leading-relaxed"
        >
          AI-powered recommendations grounded in university research—delivered in
          seconds, not days.
        </motion.p>

        {/* Dual CTAs */}
        <motion.div
          variants={item}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Button
            asChild
            size="lg"
            className="bg-hero-accent hover:bg-hero-accent/90 text-white text-lg px-8 py-6 rounded-full transition-all hover:scale-105"
            style={{
              boxShadow: "0 0 30px rgba(118,192,67,0.3)",
            }}
          >
            <Link href="/signup">
              Get Started Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="glass text-white hover:bg-white/15 text-lg px-8 py-6 rounded-full"
          >
            Watch Demo
          </Button>
        </motion.div>

        {/* No credit card note */}
        <motion.p variants={item} className="mt-6 text-sm text-white/40">
          No credit card required. Start analyzing soil tests in minutes.
        </motion.p>

        {/* Dashboard Preview */}
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.9, ease: "easeOut" }}
          className="mt-16 lg:mt-20"
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
      </motion.div>

      {/* Scroll indicator */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 animate-bounce z-10">
        <a
          href="/#trust"
          className="text-white/40 hover:text-white/70 transition-colors"
        >
          <ChevronDown className="w-7 h-7" />
        </a>
      </div>
    </section>
  );
}
