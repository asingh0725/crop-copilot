import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BookOpen, ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Blog | AI Agronomist",
  description: "Insights, tips, and research on modern farming and soil analysis.",
};

export default function BlogPage() {
  return (
    <main className="min-h-screen bg-gray-50 pt-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-[#76C043]/10 rounded-full mb-8">
            <BookOpen className="w-10 h-10 text-[#76C043]" />
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            Blog Coming Soon
          </h1>

          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            We&apos;re working on insightful articles about soil health, crop optimization,
            and the latest in agricultural technology. Stay tuned!
          </p>

          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Topics we&apos;ll cover:
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-[#76C043] rounded-full mt-2" />
                <span className="text-gray-700">Soil health best practices</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-[#76C043] rounded-full mt-2" />
                <span className="text-gray-700">Understanding soil test results</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-[#76C043] rounded-full mt-2" />
                <span className="text-gray-700">Fertilizer application timing</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-[#76C043] rounded-full mt-2" />
                <span className="text-gray-700">AI in modern agriculture</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-[#76C043] rounded-full mt-2" />
                <span className="text-gray-700">Sustainable farming techniques</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-[#76C043] rounded-full mt-2" />
                <span className="text-gray-700">Research highlights</span>
              </div>
            </div>
          </div>

          <Button asChild variant="outline" className="gap-2">
            <Link href="/">
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
