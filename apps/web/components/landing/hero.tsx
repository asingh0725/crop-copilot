"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ShieldCheck, ArrowRight } from "lucide-react";
import dynamic from "next/dynamic";
import { Float, MotionDiv, MotionStagger, staggerItem } from "./motion-wrapper";

const HeroParticles = dynamic(
  () => import("./hero-particles").then((m) => ({ default: m.HeroParticles })),
  { ssr: false }
);

const DashboardPreview = dynamic(
  () => import("./dashboard-preview").then((m) => ({ default: m.DashboardPreview })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[420px] w-full rounded-[20px] bg-earth-950/60 md:h-[560px]" />
    ),
  }
);

export function HeroSection() {
  return (
    <section className="relative min-h-screen overflow-hidden bg-earth-950 selection:bg-lime-400/25 selection:text-lime-200">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_30%_15%,rgba(245,166,35,0.2),transparent_35%),radial-gradient(circle_at_85%_82%,rgba(163,230,53,0.14),transparent_38%),linear-gradient(180deg,#050a07_0%,#08130d_45%,#050a07_100%)]" />
      <div className="absolute inset-0 z-[1] opacity-70">
        <HeroParticles />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-28 sm:px-6 lg:px-8 lg:pt-32">
        <div className="relative min-h-[72vh] overflow-hidden rounded-[36px] border border-white/14 bg-white/[0.05] shadow-[0_35px_80px_rgba(0,0,0,0.58)] backdrop-blur-2xl">
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            className="absolute inset-0 h-full w-full object-cover"
          >
            <source src="/landing/Hyper_Realistic_Soybean_Leaf_Animation.mp4" type="video/mp4" />
          </video>

          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,10,7,0.36)_0%,rgba(5,10,7,0.44)_45%,rgba(5,10,7,0.62)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_55%_42%,rgba(245,199,109,0.16),transparent_42%),radial-gradient(circle_at_45%_70%,rgba(163,230,53,0.16),transparent_46%)]" />
          <div
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.035) 52%, transparent 100%)",
              backgroundSize: "220px 100%",
            }}
          />

          <div className="pointer-events-none absolute inset-0">
            <div
              className="absolute left-[10%] top-[9%] h-[80%] w-[80%] rounded-full border border-lime-300/20"
              style={{ transform: "rotateX(72deg) rotateZ(6deg)" }}
            />
            <div
              className="absolute left-[19%] top-[14%] h-[68%] w-[68%] rounded-full border border-amber-100/20"
              style={{ transform: "rotateY(62deg)" }}
            />
          </div>

          <Float amplitude={10} delay={0.65} className="absolute right-5 top-6 z-20 md:right-10">
            <div className="rounded-2xl border border-white/15 bg-white/[0.1] px-4 py-3 backdrop-blur-xl">
              <p className="text-[11px] uppercase tracking-[0.18em] text-lime-100/75">Leaf Signal</p>
              <p className="text-xl font-semibold text-white">92.4% Match</p>
            </div>
          </Float>

          <Float amplitude={11} delay={1.05} className="absolute bottom-8 left-5 z-20 md:left-10">
            <div className="rounded-2xl border border-white/15 bg-white/[0.1] px-4 py-3 backdrop-blur-xl">
              <p className="text-[11px] uppercase tracking-[0.18em] text-lime-100/75">Context Retrieval</p>
              <p className="text-xl font-semibold text-white">RAG Synced</p>
            </div>
          </Float>

          <div className="relative z-20 flex min-h-[72vh] items-center justify-center px-6 py-16 text-center sm:px-10">
            <MotionStagger className="mx-auto max-w-4xl">
              <motion.div variants={staggerItem} custom={0} className="mb-6">
                <div className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.09] px-4 py-2 backdrop-blur-xl">
                  <ShieldCheck className="h-4 w-4 text-lime-300" />
                  <span className="text-sm font-medium tracking-wide text-lime-100/90">
                    Backed by university research
                  </span>
                  <div className="h-1 w-1 rounded-full bg-lime-400 animate-pulse" />
                </div>
              </motion.div>

              <motion.h1
                variants={staggerItem}
                custom={1}
                className="mb-6 text-5xl font-bold leading-[0.95] tracking-tight text-white drop-shadow-[0_10px_34px_rgba(0,0,0,0.65)] sm:text-6xl lg:text-7xl"
              >
                Turn Field Signals
                <br />
                Into
                <span className="relative ml-3 inline-block font-serif italic text-transparent bg-clip-text bg-[linear-gradient(115deg,#e6f9b5_10%,#a3e635_55%,#d8f58a_95%)] mix-blend-screen">
                  Precision
                  <span className="absolute -right-4 -top-2 text-amber-warm/40">✦</span>
                </span>
                <br />
                Recommendations.
              </motion.h1>

              <motion.p
                variants={staggerItem}
                custom={2}
                className="mx-auto mb-9 max-w-3xl text-lg leading-relaxed text-white/90 sm:text-xl [text-shadow:0_2px_18px_rgba(0,0,0,0.55)]"
              >
                Diagnose in seconds with a retrieval-grounded AI pipeline tuned for
                agronomy. Every answer cites evidence and maps directly to your
                crop context.
              </motion.p>

              <motion.div
                variants={staggerItem}
                custom={3}
                className="flex items-center justify-center"
              >
                <MotionDiv hoverScale={1.03}>
                  <Link
                    href="/signup"
                    className="group relative inline-flex items-center justify-center overflow-hidden rounded-full border border-lime-300/35 bg-[linear-gradient(180deg,rgba(236,255,185,0.95)_0%,rgba(163,230,53,0.95)_70%,rgba(142,208,42,0.96)_100%)] px-8 py-5 text-lg font-bold text-earth-950 shadow-[inset_0_2px_8px_rgba(255,255,255,0.68),inset_0_-8px_20px_rgba(45,77,8,0.24),0_0_28px_rgba(163,230,53,0.45)] transition-all hover:shadow-[inset_0_2px_10px_rgba(255,255,255,0.72),inset_0_-8px_24px_rgba(45,77,8,0.28),0_0_40px_rgba(163,230,53,0.56)]"
                  >
                    <span className="absolute inset-x-4 top-1 h-1/2 rounded-full bg-white/38 blur-sm transition-opacity duration-300 group-hover:opacity-90" />
                    <span className="relative flex items-center gap-2">
                      Start Analysis
                      <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                    </span>
                  </Link>
                </MotionDiv>
              </motion.div>
            </MotionStagger>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 90, rotateX: 10 }}
          whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.15 }}
          viewport={{ once: true, margin: "-80px" }}
          className="relative z-20 mx-auto mt-12 max-w-6xl lg:mt-16"
        >
          <div className="relative rounded-[24px] border border-white/15 bg-white/[0.06] p-1.5 backdrop-blur-2xl">
            <div className="absolute inset-0 rounded-[24px] bg-lime-400/5 blur-xl" />
            <DashboardPreview />
          </div>
        </motion.div>
      </div>

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-36 bg-gradient-to-t from-earth-950 to-transparent" />
    </section>
  );
}
