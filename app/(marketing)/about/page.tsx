import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Leaf,
  GraduationCap,
  Users,
  Target,
} from "lucide-react";

export const metadata = {
  title: "About | Crop Copilot",
  description:
    "Learn about Crop Copilot — our mission, approach, and commitment to research-backed agricultural advice.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Dark header area */}
      <div className="bg-hero-dark pt-28 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <Button asChild variant="ghost" size="sm" className="gap-2 text-white/60 hover:text-white hover:bg-white/10 mb-6">
            <Link href="/">
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Link>
          </Button>
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            About Crop Copilot
          </h1>
          <p className="text-xl text-white/60 leading-relaxed">
            We&apos;re building AI-powered tools that make university-level
            agricultural expertise accessible to every farmer.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid gap-10">
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-[#76C043]/10 rounded-lg flex items-center justify-center">
                <Target className="w-5 h-5 text-[#76C043]" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-900">
                Our Mission
              </h2>
            </div>
            <p className="text-gray-700 leading-relaxed">
              Getting a professional agronomist consultation can cost hundreds of
              dollars and take weeks. Meanwhile, university extension programs
              publish incredible research — but it&apos;s scattered across
              hundreds of websites, buried in PDFs, and hard to apply to your
              specific situation. We bridge that gap. Crop Copilot takes
              published research from leading agricultural universities, makes it
              searchable with AI, and delivers personalized recommendations in
              seconds.
            </p>
          </section>

          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-blue-600" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-900">
                Research-First Approach
              </h2>
            </div>
            <p className="text-gray-700 leading-relaxed mb-4">
              Our AI doesn&apos;t guess. Every recommendation is grounded in
              published university extension research. We use a technique called
              Retrieval-Augmented Generation (RAG):
            </p>
            <ol className="list-decimal pl-6 text-gray-700 space-y-2">
              <li>
                We collect and index research from universities like Iowa State,
                Purdue, Cornell, UC Davis, and more.
              </li>
              <li>
                When you submit a diagnosis, our AI searches this knowledge base
                to find the most relevant research.
              </li>
              <li>
                It then generates a recommendation — always citing which sources
                it used, so you can verify everything.
              </li>
            </ol>
          </section>

          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <Leaf className="w-5 h-5 text-amber-600" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-900">
                What We Cover
              </h2>
            </div>
            <p className="text-gray-700 leading-relaxed mb-4">
              Crop Copilot currently focuses on North American agriculture with
              particular depth in:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Row crops (corn, soybeans, wheat, sorghum, barley, oats)</li>
              <li>Nutrient deficiency diagnosis and management</li>
              <li>Disease and pest identification</li>
              <li>Soil fertility and fertilizer recommendations</li>
              <li>
                Regional best practices across the Midwest, Great Plains, and
                beyond
              </li>
            </ul>
          </section>

          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-purple-600" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-900">
                Important Disclaimer
              </h2>
            </div>
            <p className="text-gray-700 leading-relaxed">
              Crop Copilot is a decision-support tool, not a replacement for
              professional agronomic consultation. Our AI provides confidence
              scores (never above 95%) and always cites its sources so you can
              verify. For critical decisions involving significant financial
              investment, we recommend consulting with a certified crop advisor
              in addition to using our tool.
            </p>
          </section>
        </div>
        </div>
    </main>
  );
}
