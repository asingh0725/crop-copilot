import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail, MessageSquare } from "lucide-react";

export const metadata = {
  title: "Contact | AI Agronomist",
  description:
    "Get in touch with the AI Agronomist team for support, partnerships, or enterprise inquiries.",
};

export default function ContactPage() {
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
            Contact Us
          </h1>
          <p className="text-xl text-white/60">
            Have a question, feedback, or partnership inquiry? We&apos;d love to
            hear from you.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
          <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
            <div className="w-12 h-12 bg-[#76C043]/10 rounded-xl flex items-center justify-center mb-4">
              <Mail className="w-6 h-6 text-[#76C043]" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              General Inquiries
            </h2>
            <p className="text-gray-600 text-sm mb-3">
              Questions about AI Agronomist, feature requests, or feedback.
            </p>
            <a
              href="mailto:hello@aiagronomist.com"
              className="text-[#76C043] font-medium text-sm hover:underline"
            >
              hello@aiagronomist.com
            </a>
          </div>

          <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
              <MessageSquare className="w-6 h-6 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Enterprise & Partnerships
            </h2>
            <p className="text-gray-600 text-sm mb-3">
              Custom integrations, API access, or co-op partnerships.
            </p>
            <a
              href="mailto:enterprise@aiagronomist.com"
              className="text-blue-600 font-medium text-sm hover:underline"
            >
              enterprise@aiagronomist.com
            </a>
          </div>
        </div>

        <div className="bg-[#2C5F2D] rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">
            Prefer to just try it out?
          </h2>
          <p className="text-white/70 mb-6">
            Create a free account and start analyzing soil tests in minutes.
          </p>
          <Button
            asChild
            className="bg-[#76C043] hover:bg-[#76C043]/90 text-white rounded-full px-8"
          >
            <Link href="/signup">Get Started Free</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
