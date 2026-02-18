"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { LogoIcon } from "@/components/ui/logo-icon";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#pricing", label: "Pricing" },
];

export function LandingHeader() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-500",
        isScrolled
          ? "border-b border-white/10 bg-earth-950/45 shadow-[0_4px_30px_rgba(0,0,0,0.5)] backdrop-blur-2xl py-4"
          : "bg-transparent py-6"
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-lime-300 to-lime-500 shadow-[0_0_15px_rgba(163,230,53,0.3)] group-hover:shadow-[0_0_25px_rgba(163,230,53,0.5)] transition-all duration-300">
               <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <LogoIcon size={22} className="text-earth-950" />
            </div>
            <span className="font-bold text-xl text-white tracking-tight">
              Crop Copilot
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1 glass-dark rounded-full px-2 py-1.5 border border-white/5 shadow-2xl">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="relative rounded-full px-5 py-2 text-sm font-medium text-white/[0.65] transition-all duration-300 hover:bg-white/10 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* CTA Buttons */}
          <div className="hidden md:flex items-center gap-4">
            <Link 
              href="/login" 
              className="text-sm font-semibold text-white/70 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link 
               href="/signup" 
               className="group relative inline-flex items-center justify-center overflow-hidden rounded-full border border-lime-300/35 bg-[linear-gradient(180deg,rgba(236,255,185,0.96)_0%,rgba(163,230,53,0.95)_70%,rgba(142,208,42,0.96)_100%)] px-6 py-2.5 text-sm font-bold text-earth-950 shadow-[inset_0_1px_4px_rgba(255,255,255,0.75),inset_0_-6px_16px_rgba(45,77,8,0.24),0_0_22px_rgba(163,230,53,0.35)] transition-all hover:shadow-[inset_0_1px_4px_rgba(255,255,255,0.8),inset_0_-7px_18px_rgba(45,77,8,0.26),0_0_34px_rgba(163,230,53,0.48)]"
            >
              <span className="absolute inset-x-3 top-1 h-1/2 rounded-full bg-white/40 blur-sm transition-opacity duration-300 group-hover:opacity-90" />
              <span className="relative">Get Started</span>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-white/80 hover:text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="md:hidden glass-dark rounded-2xl mt-4 p-4 border border-white/10 shadow-2xl space-y-2"
            >
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block rounded-xl px-4 py-3 font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <div className="pt-4 border-t border-white/5 grid grid-cols-2 gap-3">
                 <Link href="/login" className="flex items-center justify-center py-3 text-white/80 font-semibold hover:bg-white/5 rounded-xl transition-colors">
                    Sign In
                 </Link>
                 <Link href="/signup" className="flex items-center justify-center rounded-xl border border-lime-300/35 bg-[linear-gradient(180deg,rgba(236,255,185,0.96)_0%,rgba(163,230,53,0.95)_70%,rgba(142,208,42,0.96)_100%)] py-3 font-bold text-earth-950 shadow-[inset_0_1px_4px_rgba(255,255,255,0.75),inset_0_-6px_16px_rgba(45,77,8,0.24)] transition-opacity hover:opacity-95">
                    Get Started
                 </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.header>
  );
}
