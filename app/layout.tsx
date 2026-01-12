import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Agronomist Advisor",
  description:
    "Diagnose crop issues. Get actionable recommendations. Find the right products.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
