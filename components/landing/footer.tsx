"use client";

import Link from "next/link";
import { Leaf } from "lucide-react";

export function Footer() {
  const footerLinks = {
    product: [
      { label: "Features", href: "/#features" },
      { label: "Pricing", href: "/#pricing" },
      { label: "How It Works", href: "/#how-it-works" },
      { label: "API", href: "/api-docs" },
    ],
    company: [
      { label: "About", href: "/about" },
      { label: "Blog", href: "/blog" },
      { label: "Contact", href: "/contact" },
    ],
    legal: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
    ],
  };

  return (
    <footer className="bg-earth-950 text-gray-300 topo-pattern relative">
      {/* CTA Banner */}
      <div className="border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Ready to optimize your farm?
            </h2>
            <p className="text-white/40 mb-8 max-w-xl mx-auto">
              Start analyzing soil tests in minutes — no credit card required.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center px-8 py-4 bg-lime-400 hover:bg-lime-300 text-earth-950 font-semibold rounded-full transition-all hover:scale-[1.03] glow-accent"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </div>

      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-lime-400">
                <Leaf className="w-5 h-5 text-earth-950" />
              </div>
              <span className="font-semibold text-lg text-white">
                Crop Copilot
              </span>
            </Link>
            <p className="text-white/40 text-sm">
              AI-powered soil analysis for modern farmers.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-semibold text-white mb-4 text-sm">Product</h4>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/40 hover:text-lime-400 transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-semibold text-white mb-4 text-sm">Company</h4>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/40 hover:text-lime-400 transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-semibold text-white mb-4 text-sm">Legal</h4>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/40 hover:text-lime-400 transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 pt-8 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-sm text-white/30">
            &copy; {new Date().getFullYear()} Crop Copilot. All rights reserved.
          </p>
          <p className="text-sm text-white/30">
            Made with care for farmers everywhere.
          </p>
        </div>
      </div>
    </footer>
  );
}
