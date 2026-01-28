"use client";

export function TrustBar() {
  const partners = [
    { name: "Iowa State University", abbrev: "Iowa State" },
    { name: "Purdue University", abbrev: "Purdue" },
    { name: "University of Minnesota", abbrev: "UMN" },
    { name: "Kansas State University", abbrev: "K-State" },
    { name: "University of Nebraska", abbrev: "Nebraska" },
  ];

  return (
    <section id="trust" className="py-12 bg-[#F9F9F9] border-y border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-sm text-gray-500 mb-8 uppercase tracking-wider font-medium">
          Research sourced from leading agricultural universities
        </p>
        <div className="flex flex-wrap items-center justify-center gap-8 lg:gap-16">
          {partners.map((partner) => (
            <div
              key={partner.name}
              className="text-gray-400 font-semibold text-lg hover:text-gray-600 transition-colors"
            >
              {partner.abbrev}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
