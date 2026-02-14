import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Code2, Lock, Zap } from "lucide-react";

export const metadata = {
  title: "API Documentation | Crop Copilot",
  description:
    "Crop Copilot API documentation — integrate soil analysis and crop recommendations into your own applications.",
};

export default function ApiDocsPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Dark header area */}
      <div className="bg-hero-dark pt-28 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white/10 rounded-full mb-6">
            <Code2 className="w-10 h-10 text-hero-accent" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            API Coming Soon
          </h1>
          <p className="text-xl text-white/60 max-w-2xl mx-auto">
            We&apos;re building an API so you can integrate Crop Copilot&apos;s
            soil analysis and recommendation engine into your own applications.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
          <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center mb-4">
              <Zap className="w-6 h-6 text-amber-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Planned Endpoints
            </h3>
            <ul className="text-gray-600 text-sm space-y-2">
              <li>Submit soil test data for analysis</li>
              <li>Upload crop photos for diagnosis</li>
              <li>Retrieve recommendations programmatically</li>
              <li>Search product database</li>
              <li>Manage user profiles and history</li>
            </ul>
          </div>

          <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
              <Lock className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Enterprise Only
            </h3>
            <p className="text-gray-600 text-sm">
              API access will be available on our Enterprise plan. Interested in
              early access? Contact us to discuss your integration needs.
            </p>
          </div>
        </div>

        <div className="text-center">
          <p className="text-gray-500 mb-4">
            Want to be notified when the API launches?
          </p>
          <Button asChild className="bg-[#76C043] hover:bg-[#76C043]/90 text-white rounded-full px-8">
            <Link href="/contact">Contact Us for Early Access</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
