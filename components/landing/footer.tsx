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
      // { label: "Careers", href: "/careers" },
      { label: "Contact", href: "/contact" },
    ],
    // resources: [
    //   { label: "Documentation", href: "/docs" },
    //   { label: "Help Center", href: "/help" },
    //   { label: "Research Sources", href: "/research" },
    //   { label: "Community", href: "/community" },
    // ],
    legal: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      // { label: "Cookie Policy", href: "/cookies" },
    ],
  };

  return (
    <footer className="bg-gray-900 text-gray-300">
      {/* CTA Banner */}
      <div className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Ready to optimize your farm?
            </h2>
            <p className="text-gray-400 mb-8 max-w-xl mx-auto">
              Start analyzing soil tests in minutes — no credit card required.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center px-8 py-4 bg-[#76C043] hover:bg-[#5fa032] text-white font-medium rounded-full transition-colors"
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
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#76C043]">
                <Leaf className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold text-lg text-white">
                AI Agronomist
              </span>
            </Link>
            <p className="text-gray-400 text-sm">
              AI-powered soil analysis for modern farmers.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-semibold text-white mb-4">Product</h4>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-semibold text-white mb-4">Company</h4>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources
          <div>
            <h4 className="font-semibold text-white mb-4">Resources</h4>
            <ul className="space-y-3">
              {footerLinks.resources.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div> */}

          {/* Legal */}
          <div>
            <h4 className="font-semibold text-white mb-4">Legal</h4>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 pt-8 border-t border-gray-800 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} AI Agronomist. All rights reserved.
          </p>
          <p className="text-sm text-gray-500">
            Made with care for farmers everywhere.
          </p>
        </div>
      </div>
    </footer>
  );
}
