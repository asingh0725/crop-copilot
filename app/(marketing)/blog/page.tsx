import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BookOpen, ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Blog | Crop Copilot",
  description: "Insights, tips, and research on modern farming and soil analysis.",
};

export default function BlogPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Dark header area */}
      <div className="bg-hero-dark pt-28 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white/10 rounded-full mb-6">
            <BookOpen className="w-10 h-10 text-hero-accent" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            Blog Coming Soon
          </h1>
          <p className="text-xl text-white/60 max-w-2xl mx-auto">
            We&apos;re working on insightful articles about soil health, crop optimization,
            and the latest in agricultural technology. Stay tuned!
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Topics we&apos;ll cover:
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
            {[
              "Soil health best practices",
              "Understanding soil test results",
              "Fertilizer application timing",
              "AI in modern agriculture",
              "Sustainable farming techniques",
              "Research highlights",
            ].map((topic) => (
              <div key={topic} className="flex items-start gap-3">
                <div className="w-2 h-2 bg-[#76C043] rounded-full mt-2" />
                <span className="text-gray-700">{topic}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center">
          <Button asChild className="bg-[#76C043] hover:bg-[#76C043]/90 text-white rounded-full px-8">
            <Link href="/signup">Get Started Free</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
