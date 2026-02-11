"use client";

import { Star } from "lucide-react";
import { motion } from "framer-motion";
import { MotionDiv, MotionStagger, staggerItem } from "./motion-wrapper";

const testimonials = [
  {
    quote:
      "AI Agronomist cut my fertilizer costs by 15% while actually improving my corn yields. The recommendations are spot-on.",
    author: "Mike Thompson",
    role: "Corn & Soybean Farmer",
    location: "Iowa",
    rating: 5,
  },
  {
    quote:
      "I used to wait weeks for soil test results. Now I upload my report and have actionable recommendations in minutes.",
    author: "Sarah Chen",
    role: "Farm Manager",
    location: "Nebraska",
    rating: 5,
  },
  {
    quote:
      "The fact that it\u2019s based on university research gives me confidence. It\u2019s like having an agronomist in my pocket.",
    author: "James Rodriguez",
    role: "Third-Generation Farmer",
    location: "Kansas",
    rating: 5,
  },
];

export function TestimonialsSection() {
  return (
    <section className="py-20 lg:py-28 bg-[#2C5F2D]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <MotionDiv className="text-center mb-16">
          <span className="inline-block glass rounded-full px-4 py-1.5 text-white/80 text-sm font-medium mb-4">
            Early Adopter Feedback
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
            What Farmers Are Saying
          </h2>
          <p className="text-lg text-white/60 max-w-2xl mx-auto">
            See what farmers across the Midwest are saying about AI Agronomist.
          </p>
        </MotionDiv>

        <MotionStagger className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={index}
              variants={staggerItem}
              className="glass rounded-2xl p-8 hover:bg-white/[0.12] transition-colors"
            >
              {/* Stars */}
              <div className="flex gap-1 mb-4">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star
                    key={i}
                    className="w-5 h-5 text-hero-accent fill-hero-accent"
                  />
                ))}
              </div>

              {/* Quote */}
              <blockquote className="text-white text-lg leading-relaxed mb-6">
                &ldquo;{testimonial.quote}&rdquo;
              </blockquote>

              {/* Author */}
              <div>
                <div className="font-semibold text-white">
                  {testimonial.author}
                </div>
                <div className="text-white/50 text-sm">
                  {testimonial.role}, {testimonial.location}
                </div>
              </div>
            </motion.div>
          ))}
        </MotionStagger>
      </div>
    </section>
  );
}
