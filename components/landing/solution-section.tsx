"use client";

import { Upload, Cpu, FileCheck, Sprout } from "lucide-react";

export function SolutionSection() {
  const steps = [
    {
      icon: Upload,
      step: "01",
      title: "Upload Your Soil Test",
      description: "Simply upload your existing soil test report\u2014PDF, image, or enter values manually.",
    },
    {
      icon: Cpu,
      step: "02",
      title: "AI Analysis",
      description: "Our AI processes your data using university-backed research and agronomic models.",
    },
    {
      icon: FileCheck,
      step: "03",
      title: "Get Recommendations",
      description: "Receive personalized fertilizer recommendations with specific rates and timing.",
    },
    {
      icon: Sprout,
      step: "04",
      title: "Maximize Yield",
      description: "Apply with confidence knowing your recommendations are scientifically optimized.",
    },
  ];

  return (
    <section id="how-it-works" className="py-20 lg:py-28 bg-gradient-to-b from-[#F5F7F5] to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-1.5 bg-[#76C043]/10 text-[#2C5F2D] rounded-full text-sm font-medium mb-4">
            The Solution
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
            How AI Agronomist Works
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Get expert-level recommendations in seconds, not weeks. Here&apos;s how simple it is.
          </p>
        </div>

        <div className="relative">
          {/* Connection line for desktop */}
          <div className="hidden lg:block absolute top-24 left-[12.5%] right-[12.5%] h-0.5 bg-gradient-to-r from-[#76C043]/20 via-[#76C043] to-[#76C043]/20" />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-6">
            {steps.map((step, index) => (
              <div key={index} className="relative">
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg hover:border-[#76C043]/30 transition-all duration-300">
                  {/* Step number */}
                  <div className="relative z-10 w-14 h-14 bg-[#2C5F2D] rounded-2xl flex items-center justify-center mb-5 mx-auto lg:mx-0">
                    <step.icon className="w-7 h-7 text-white" />
                  </div>

                  <div className="text-center lg:text-left">
                    <span className="text-[#76C043] font-bold text-sm">
                      Step {step.step}
                    </span>
                    <h3 className="text-xl font-semibold text-gray-900 mt-1 mb-3">
                      {step.title}
                    </h3>
                    <p className="text-gray-600 text-sm leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
