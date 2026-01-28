"use client";

import { Star } from "lucide-react";

export function TestimonialsSection() {
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
        "The fact that it's based on university research gives me confidence. It's like having an agronomist in my pocket.",
      author: "James Rodriguez",
      role: "Third-Generation Farmer",
      location: "Kansas",
      rating: 5,
    },
  ];

  return (
    <section className="py-20 lg:py-28 bg-[#2C5F2D]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-1.5 bg-white/10 text-white rounded-full text-sm font-medium mb-4">
            Testimonials
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
            Trusted by Farmers
          </h2>
          <p className="text-lg text-white/70 max-w-2xl mx-auto">
            See what farmers across the Midwest are saying about AI Agronomist.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/10 hover:bg-white/15 transition-colors"
            >
              {/* Stars */}
              <div className="flex gap-1 mb-4">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star
                    key={i}
                    className="w-5 h-5 text-[#76C043] fill-[#76C043]"
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
                <div className="text-white/60 text-sm">
                  {testimonial.role}, {testimonial.location}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8 pt-16 border-t border-white/10">
          <div className="text-center">
            <div className="text-4xl lg:text-5xl font-bold text-white mb-2">
              500+
            </div>
            <div className="text-white/60">Active Farmers</div>
          </div>
          <div className="text-center">
            <div className="text-4xl lg:text-5xl font-bold text-white mb-2">
              10K+
            </div>
            <div className="text-white/60">Soil Tests Analyzed</div>
          </div>
          <div className="text-center">
            <div className="text-4xl lg:text-5xl font-bold text-white mb-2">
              15%
            </div>
            <div className="text-white/60">Avg. Cost Savings</div>
          </div>
          <div className="text-center">
            <div className="text-4xl lg:text-5xl font-bold text-white mb-2">
              4.9
            </div>
            <div className="text-white/60">User Rating</div>
          </div>
        </div>
      </div>
    </section>
  );
}
