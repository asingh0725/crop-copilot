export const metadata = {
  title: "Privacy Policy | Crop Copilot",
  description: "Privacy Policy for Crop Copilot - Learn how we collect, use, and protect your data.",
};

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicyPage() {
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
          <h1 className="text-4xl font-bold text-white mb-2">Privacy Policy</h1>
          <p className="text-white/50">Last updated: January 2025</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="prose prose-gray max-w-none">
          <section className="mb-10">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Introduction</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Crop Copilot (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy.
              This Privacy Policy explains how we collect, use, disclose, and safeguard your information
              when you use our soil analysis and agricultural recommendation service.
            </p>
            <p className="text-gray-700 leading-relaxed">
              By using Crop Copilot, you agree to the collection and use of information in accordance
              with this policy.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Information We Collect</h2>

            <h3 className="text-xl font-medium text-gray-900 mb-3">2.1 Personal Information</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              When you create an account, we collect:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Name and email address</li>
              <li>Farm name and location (optional)</li>
              <li>Account credentials</li>
            </ul>

            <h3 className="text-xl font-medium text-gray-900 mb-3">2.2 Agricultural Data</h3>
            <p className="text-gray-700 leading-relaxed mb-4">
              To provide our services, we collect:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Soil test reports and results you upload</li>
              <li>Field and crop information you provide</li>
              <li>Photos of crops or soil conditions</li>
              <li>Generated recommendations and analysis history</li>
            </ul>

            <h3 className="text-xl font-medium text-gray-900 mb-3">2.3 Usage Data</h3>
            <p className="text-gray-700 leading-relaxed">
              We automatically collect certain information when you use our service, including
              device information, IP address, browser type, and usage patterns to improve our service.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. How We Use Your Information</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We use your information to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Provide personalized soil analysis and fertilizer recommendations</li>
              <li>Process and store your soil test data</li>
              <li>Improve our AI models and recommendation accuracy</li>
              <li>Send service-related communications</li>
              <li>Provide customer support</li>
              <li>Ensure service security and prevent fraud</li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Data Sharing and Disclosure</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We do not sell your personal information. We may share your data with:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Service Providers:</strong> Third-party services that help us operate (cloud hosting, analytics)</li>
              <li><strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
              <li><strong>Aggregated Data:</strong> We may share anonymized, aggregated data for research purposes</li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Data Security</h2>
            <p className="text-gray-700 leading-relaxed">
              We implement industry-standard security measures to protect your data, including
              encryption in transit and at rest, secure authentication, and regular security audits.
              However, no method of transmission over the Internet is 100% secure, and we cannot
              guarantee absolute security.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Data Retention</h2>
            <p className="text-gray-700 leading-relaxed">
              We retain your personal information and agricultural data for as long as your account
              is active or as needed to provide our services. You can request deletion of your data
              at any time by contacting us or deleting your account.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Your Rights</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              You have the right to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Access the personal data we hold about you</li>
              <li>Correct inaccurate or incomplete data</li>
              <li>Delete your account and associated data</li>
              <li>Export your data in a portable format</li>
              <li>Opt out of non-essential communications</li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Children&apos;s Privacy</h2>
            <p className="text-gray-700 leading-relaxed">
              Our service is not intended for individuals under 18 years of age. We do not knowingly
              collect personal information from children under 18.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. Changes to This Policy</h2>
            <p className="text-gray-700 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any changes
              by posting the new policy on this page and updating the &quot;Last updated&quot; date. Continued
              use of the service after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. Contact Us</h2>
            <p className="text-gray-700 leading-relaxed">
              If you have questions about this Privacy Policy or our data practices, please contact us at:
            </p>
            <p className="text-gray-700 mt-4">
              <strong>Email:</strong> privacy@cropcopilot.app<br />
              <strong>Address:</strong> Crop Copilot, LLC
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
