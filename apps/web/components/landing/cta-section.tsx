"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";

export function CTASection() {
  return (
    <section className="relative overflow-hidden bg-earth-950 py-24 lg:py-32">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(245,166,35,0.14),transparent_32%),radial-gradient(circle_at_82%_80%,rgba(163,230,53,0.14),transparent_30%),linear-gradient(180deg,#08130d_0%,#050a07_100%)]" />
      <div className="grain-overlay absolute inset-0 opacity-40 mix-blend-overlay" />

      <div className="pointer-events-none absolute left-1/2 top-0 h-[820px] w-[820px] -translate-x-1/2 rounded-full bg-lime-400/[0.09] blur-[120px]" />

      <motion.div
        className="absolute top-1/2 left-1/4 w-[400px] h-[400px] rounded-full pointer-events-none blur-3xl opacity-20"
        style={{
          background:
            "radial-gradient(circle, rgba(163,230,53,0.15) 0%, transparent 70%)",
        }}
        animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-1/3 right-1/4 w-[300px] h-[300px] rounded-full pointer-events-none blur-3xl opacity-20"
        style={{
          background:
            "radial-gradient(circle, rgba(163,230,53,0.1) 0%, transparent 70%)",
        }}
        animate={{ scale: [1.1, 0.9, 1.1], opacity: [0.1, 0.3, 0.1] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
        >
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.09] px-4 py-2 backdrop-blur-xl shadow-[0_0_15px_rgba(163,230,53,0.1)]">
            <Sparkles className="w-4 h-4 text-lime-400" />
            <span className="text-sm text-lime-100/70 font-medium">
              Start diagnosing today
            </span>
          </div>

          <h2 className="mb-8 text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-7xl">
            Ready to Transform
            <br />
            Your{" "}
            <span className="font-serif italic text-transparent bg-clip-text bg-[linear-gradient(120deg,#f5c76d_8%,#a3e635_50%,#dff3a8_95%)]">
              Farm
            </span>
            ?
          </h2>

          <p className="text-lg sm:text-xl text-white/50 max-w-2xl mx-auto mb-12 leading-relaxed">
            Join thousands of farmers using AI-powered diagnostics to protect
            their crops, save time, and increase yields.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <Link href="/signup" className="group relative inline-flex items-center justify-center overflow-hidden rounded-full border border-lime-300/35 bg-[linear-gradient(180deg,rgba(236,255,185,0.96)_0%,rgba(163,230,53,0.95)_70%,rgba(142,208,42,0.96)_100%)] px-10 py-5 text-lg font-bold text-earth-950 shadow-[inset_0_2px_8px_rgba(255,255,255,0.75),inset_0_-10px_22px_rgba(45,77,8,0.24),0_0_30px_rgba(163,230,53,0.42)] transition-all hover:shadow-[inset_0_2px_8px_rgba(255,255,255,0.8),inset_0_-10px_26px_rgba(45,77,8,0.28),0_0_42px_rgba(163,230,53,0.56)]">
               <span className="absolute inset-x-5 top-1 h-1/2 rounded-full bg-white/45 blur-sm transition-opacity duration-300 group-hover:opacity-90" />
               <span className="relative flex items-center gap-2">
                 Get Started Free <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
               </span>
            </Link>
            <p className="text-sm font-medium text-white/[0.35]">
              No credit card required
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
