"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { motion } from "framer-motion";
import { MotionDiv, MotionStagger, staggerItem } from "./motion-wrapper";

const plans = [
  {
    name: "Grower Free",
    price: "$0",
    period: "/month",
    description: "No-credit-card starter plan powered through Stripe subscriptions",
    features: [
      "3 recommendation credits per month",
      "Base recommendation workflow (photo + lab inputs)",
      "Upgrade anytime to Grower or Grower Pro",
      "No credit card required",
    ],
    cta: "Start Free",
    href: "/signup?plan=grower_free",
    popular: false,
  },
  {
    name: "Grower",
    price: "$29",
    period: "/month",
    description: "Core AI recommendations with controlled usage and credit top-ups",
    features: [
      "30 recommendation credits per month",
      "Base recommendation workflow (photo + lab inputs)",
      "Buy extra credits: 10 recommendations for $12",
      "Detailed feedback rewards: $0.05 credit each (up to $2.50/month)",
      "Recommendation history and source citations",
      "Advisory safety disclaimers and product guidance",
    ],
    cta: "Start Grower",
    href: "/signup?plan=grower",
    popular: true,
  },
  {
    name: "Grower Pro",
    price: "$45",
    period: "/month",
      description: "Everything in Grower plus operational risk and cost controls",
      features: [
        "40 recommendation credits per month",
        "Application Risk Review: label-context checks with evidence and unresolved flags",
        "Cost Optimizer: per-acre + whole-field costs and cheaper swap options",
        "Spray-Window Alerts based on weather and timing",
        "1-tap Application Prep Packet for sharing and print-ready field records",
        "Priority queue for premium enrichment processing",
      ],
    cta: "Upgrade to Pro",
    href: "/signup?plan=grower_pro",
    popular: false,
  },
  {
    name: "Enterprise",
    price: "Custom",
    description: "For co-ops and large operations needing custom controls",
      features: [
        "Everything in Grower Pro",
        "Centralized team billing and procurement controls",
        "Custom risk-rule packs and jurisdiction context overrides",
        "Dedicated onboarding and support SLA",
        "Private integrations and reporting exports",
      ],
    cta: "Contact Sales",
    href: "/contact",
    popular: false,
  },
];

export function PricingSection() {
  return (
    <section id="pricing" className="py-20 lg:py-28 bg-earth-950 topo-pattern relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <MotionDiv className="text-center mb-16">
          <span className="inline-block glass rounded-full px-4 py-1.5 text-lime-400 text-sm font-medium mb-4">
            Pricing
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
            Simple, Transparent{" "}
            <span className="font-serif italic text-gradient">Pricing</span>
          </h2>
          <p className="text-lg text-white/50 max-w-2xl mx-auto">
            Metered recommendations, transparent overages, and clear Pro value.
          </p>
        </MotionDiv>

        <MotionStagger className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 lg:gap-5">
          {plans.map((plan, index) => (
            <motion.div
              key={index}
              variants={staggerItem}
              className={`relative rounded-2xl p-8 transition-all duration-300 ${
                plan.popular
                  ? "glass border-lime-400/30 shadow-xl shadow-lime-400/5 scale-[1.02] lg:scale-105"
                  : "glass border-white/10 hover:border-white/20"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-lime-400 text-earth-950 text-sm font-bold px-4 py-1 rounded-full shadow-lg glow-accent-sm">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="text-center mb-8">
                <h3 className="text-xl font-semibold text-white mb-2">
                  {plan.name}
                </h3>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-bold text-white">
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className="text-white/40">{plan.period}</span>
                  )}
                </div>
                <p className="text-white/50 text-sm mt-2">{plan.description}</p>
              </div>

              <ul className="space-y-4 mb-8">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-lime-400 shrink-0 mt-0.5" />
                    <span className="text-white/70 text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                className={`w-full rounded-full font-semibold transition-all ${
                  plan.popular
                    ? "bg-lime-400 hover:bg-lime-300 text-earth-950 hover:scale-[1.02] glow-accent-sm"
                    : "bg-white/10 hover:bg-white/15 text-white border border-white/10"
                }`}
              >
                <Link href={plan.href}>{plan.cta}</Link>
              </Button>
            </motion.div>
          ))}
        </MotionStagger>
      </div>
    </section>
  );
}
