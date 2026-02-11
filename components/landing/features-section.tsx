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
import { MotionDiv, MotionStagger, staggerItem } from "./motion-wrapper";

const features = [
  {
    icon: Zap,
    title: "Instant Analysis",
    description:
      "Get comprehensive soil analysis and recommendations in seconds, not weeks.",
    color: "bg-amber-100 text-amber-600",
  },
  {
    icon: Shield,
    title: "Research-Backed",
    description:
      "All recommendations grounded in peer-reviewed university research and proven methodologies.",
    color: "bg-blue-100 text-blue-600",
  },
  {
    icon: BarChart3,
    title: "Cited Recommendations",
    description:
      "Every recommendation comes with citations to the university research that backs it up.",
    color: "bg-purple-100 text-purple-600",
  },
  {
    icon: Leaf,
    title: "Sustainable Practices",
    description:
      "Optimize nutrient application to reduce environmental impact while maximizing yield.",
    color: "bg-green-100 text-green-600",
  },
  {
    icon: Cloud,
    title: "Cloud Storage",
    description:
      "All your soil tests and recommendations securely stored and accessible anywhere.",
    color: "bg-sky-100 text-sky-600",
  },
  {
    icon: BookOpen,
    title: "Educational Insights",
    description:
      "Learn why each recommendation is made with detailed explanations and sources.",
    color: "bg-rose-100 text-rose-600",
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="py-20 lg:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <MotionDiv className="text-center mb-16">
          <span className="inline-block px-4 py-1.5 bg-[#76C043]/10 text-[#2C5F2D] rounded-full text-sm font-medium mb-4">
            Features
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
            Everything You Need
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Powerful features designed specifically for modern farmers who want
            data-driven decisions.
          </p>
        </MotionDiv>

        <MotionStagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              variants={staggerItem}
              className="group p-8 bg-gray-50 rounded-2xl border border-gray-100 hover:bg-white hover:shadow-xl hover:border-transparent hover:scale-[1.02] transition-all duration-300"
            >
              <div
                className={`w-14 h-14 ${feature.color} rounded-2xl flex items-center justify-center mb-5`}
              >
                <feature.icon className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                {feature.title}
              </h3>
              <p className="text-gray-600 leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </MotionStagger>
      </div>
    </section>
  );
}
