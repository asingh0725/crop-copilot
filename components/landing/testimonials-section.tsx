"use client";

import { Star } from "lucide-react";
import { motion } from "framer-motion";
import { MotionDiv, MotionStagger, staggerItem } from "./motion-wrapper";

const testimonials = [
  {
    quote:
      "Crop Copilot cut my fertilizer costs by 15% while actually improving my corn yields. The recommendations are spot-on.",
    author: "Mike Thompson",
    role: "Corn & Soybean Farmer",
    location: "Iowa",
    rating: 5,
    initials: "MT",
    color: "bg-lime-400/20 text-lime-400",
  },
  {
    quote:
      "I used to wait weeks for soil test results. Now I upload my report and have actionable recommendations in minutes.",
    author: "Sarah Chen",
    role: "Farm Manager",
    location: "Nebraska",
    rating: 5,
    initials: "SC",
    color: "bg-amber-warm/20 text-amber-warm",
  },
  {
    quote:
      "The fact that it\u2019s based on university research gives me confidence. It\u2019s like having an agronomist in my pocket.",
    author: "James Rodriguez",
    role: "Third-Generation Farmer",
    location: "Kansas",
    rating: 5,
    initials: "JR",
    color: "bg-sky-400/20 text-sky-400",
  },
];

export function TestimonialsSection() {
  return (
    <section className="py-20 lg:py-28 bg-earth-800 relative overflow-hidden">
      <div className="grain-overlay absolute inset-0" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <MotionDiv className="text-center mb-16">
          <span className="inline-block glass rounded-full px-4 py-1.5 text-white/80 text-sm font-medium mb-4">
            Early Adopter Feedback
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
            What Farmers Are{" "}
            <span className="font-serif italic text-gradient">Saying</span>
          </h2>
          <p className="text-lg text-white/50 max-w-2xl mx-auto">
            See what farmers across the Midwest are saying about Crop Copilot.
          </p>
        </MotionDiv>

        <MotionStagger className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={index}
              variants={staggerItem}
              whileHover={{ y: -4, rotate: 0 }}
              className="glass rounded-2xl p-8 hover:bg-white/[0.12] transition-all duration-300"
              style={{
                rotate: index === 0 ? -1 : index === 2 ? 1 : 0,
              }}
            >
              {/* Stars */}
              <div className="flex gap-1 mb-5">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star
                    key={i}
                    className="w-4 h-4 text-lime-400 fill-lime-400"
                  />
                ))}
              </div>

              {/* Quote */}
              <blockquote className="text-white/90 text-base leading-relaxed mb-6">
                &ldquo;{testimonial.quote}&rdquo;
              </blockquote>

              {/* Author */}
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${testimonial.color}`}
                >
                  {testimonial.initials}
                </div>
                <div>
                  <div className="font-semibold text-white text-sm">
                    {testimonial.author}
                  </div>
                  <div className="text-white/40 text-xs">
                    {testimonial.role}, {testimonial.location}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </MotionStagger>
      </div>
    </section>
  );
}
