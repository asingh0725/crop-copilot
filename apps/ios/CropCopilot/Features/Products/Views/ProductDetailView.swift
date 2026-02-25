//
//  ProductDetailView.swift
//  CropCopilot
//

import SwiftUI

private enum PricingSheetDetent: CGFloat, CaseIterable {
    case compact = 0.46
    case medium = 0.68
    case expanded = 0.9
}

struct ProductDetailView: View {
    let productId: String

    @StateObject private var viewModel: ProductDetailViewModel
    @State private var showPricingSheet = false
    @State private var showPricingLocationConfirm = false
    @State private var pricingDetent: PricingSheetDetent = .medium

    init(productId: String) {
        self.productId = productId
        _viewModel = StateObject(wrappedValue: ProductDetailViewModel(productId: productId))
    }

    var body: some View {
        ZStack {
            Group {
                if viewModel.isLoading {
                    ScrollView {
                        VStack(alignment: .leading, spacing: Spacing.md) {
                            // Header skeleton
                            VStack(alignment: .leading, spacing: Spacing.md) {
                                HStack {
                                    SkeletonCard(height: 44, cornerRadius: 13).frame(width: 44)
                                    Spacer()
                                    SkeletonLine(width: 80, height: 26, cornerRadius: 13)
                                }
                                SkeletonLine(height: 22)
                                SkeletonLine(width: 140, height: 16)
                                SkeletonLine(height: 13)
                                SkeletonLine(height: 13)
                                SkeletonLine(width: 200, height: 13)
                            }
                            .padding(Spacing.lg)
                            .antigravityGlass(cornerRadius: CornerRadius.lg)

                            // Pricing row skeleton
                            SkeletonCard(height: 64, cornerRadius: CornerRadius.lg)

                            // Sections
                            ForEach(0..<2, id: \.self) { _ in
                                VStack(alignment: .leading, spacing: Spacing.sm) {
                                    SkeletonLine(width: 180, height: 18)
                                    SkeletonLine(height: 13)
                                    SkeletonLine(height: 13)
                                }
                                .padding(Spacing.md)
                                .antigravityGlass(cornerRadius: CornerRadius.lg)
                            }
                        }
                        .padding(Spacing.lg)
                    }
                } else if let product = viewModel.product {
                    ScrollView {
                        VStack(alignment: .leading, spacing: Spacing.md) {
                            headerCard(product)
                            pricingRow
                            recommendationLinks(product)
                            relatedProducts(product)
                        }
                        .padding(Spacing.lg)
                        .padding(.bottom, Spacing.xl)
                    }
                } else {
                    Text(viewModel.errorMessage ?? "Failed to load product.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding()
                }
            }

            if showPricingSheet {
                Color.black.opacity(0.38)
                    .ignoresSafeArea()
                    .onTapGesture {}
                    .transition(.opacity)

                pricingOverlay
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .navigationTitle("Product")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await viewModel.loadProduct()
        }
        .animation(.easeInOut(duration: AnimationDuration.fast), value: showPricingSheet)
    }

    // MARK: - Header Card

    private func headerCard(_ product: ProductDetailResponse) -> some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            // Type icon + badge row
            HStack(alignment: .top) {
                IconBadge(
                    icon: iconForType(product.type),
                    color: .forProductType(product.type),
                    size: 44,
                    cornerRadius: 13
                )
                Spacer()
                ProductTypeBadge(type: product.type)
            }

            // Name and brand
            VStack(alignment: .leading, spacing: 4) {
                Text(product.name)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.primary)

                if let brand = product.brand, !brand.isEmpty {
                    Text(brand)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            if let description = product.description, !description.isEmpty {
                Text(description)
                    .font(.body)
                    .foregroundStyle(.secondary)
            }

            if !product.crops.isEmpty {
                Text(product.crops.map(AppConstants.cropLabel).joined(separator: " • "))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.lg)
        .antigravityGlass(cornerRadius: CornerRadius.lg)
        .coloredShadow(.forProductType(product.type), radius: 8, opacity: 0.08)
    }

    private func iconForType(_ type: String) -> String {
        switch type.uppercased() {
        case "FERTILIZER":     return "drop.fill"
        case "PESTICIDE":      return "shield.fill"
        case "HERBICIDE":      return "xmark.circle.fill"
        case "FUNGICIDE":      return "staroflife.fill"
        case "AMENDMENT":      return "square.stack.3d.up.fill"
        case "BIOLOGICAL":     return "leaf.fill"
        case "INSECTICIDE":    return "ant.fill"
        case "SEED_TREATMENT": return "circle.hexagongrid.fill"
        default:               return "shippingbox.fill"
        }
    }

    // MARK: - Pricing Row

    private var pricingRow: some View {
        Button {
            showPricingLocationConfirm = true
        } label: {
            HStack(spacing: Spacing.sm) {
                IconBadge(icon: "dollarsign.circle.fill", color: .appPrimary, size: 36, cornerRadius: 10)

                VStack(alignment: .leading, spacing: 2) {
                    Text("On-demand pricing")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                    Text("Tap to fetch latest pricing")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Spacing.md)
            .antigravityGlass(cornerRadius: CornerRadius.lg)
        }
        .buttonStyle(.plain)
        .confirmationDialog(
            "Fetch Pricing For \(viewModel.pricingRegion)",
            isPresented: $showPricingLocationConfirm,
            titleVisibility: .visible
        ) {
            Button("Use \(viewModel.pricingRegion)") {
                showPricingSheet = true
                Task { await viewModel.loadPricingOnDemand(region: viewModel.pricingRegion) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Pricing varies by region. Confirm your location to get accurate results.")
        }
    }

    // MARK: - Recommendation Links

    private func recommendationLinks(_ product: ProductDetailResponse) -> some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            SectionHeader(title: "Used In Recommendations") {
                Text("\(product.usedInRecommendations)")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            if product.recommendations.isEmpty {
                Text("No linked recommendations yet.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 4)
            } else {
                ForEach(product.recommendations.prefix(6)) { rec in
                    NavigationLink {
                        RecommendationDetailView(recommendationId: rec.recommendationId)
                    } label: {
                        HStack(spacing: Spacing.sm) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(rec.condition)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(.primary)
                                    .lineLimit(2)
                                Text(
                                    [rec.crop.map(AppConstants.cropLabel), prettyDate(rec.createdAt)]
                                        .compactMap { $0 }
                                        .joined(separator: " • ")
                                )
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                        }
                        .padding(Spacing.md)
                        .antigravityGlass(cornerRadius: CornerRadius.md)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Related Products

    private func relatedProducts(_ product: ProductDetailResponse) -> some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            SectionHeader(title: "Related Products")

            if product.relatedProducts.isEmpty {
                Text("No related products available.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(product.relatedProducts.prefix(4)) { related in
                    NavigationLink {
                        ProductDetailView(productId: related.id)
                    } label: {
                        HStack(spacing: Spacing.sm) {
                            IconBadge(
                                icon: iconForType(related.type),
                                color: .forProductType(related.type),
                                size: 34,
                                cornerRadius: 10
                            )
                            VStack(alignment: .leading, spacing: 3) {
                                Text(related.name)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(.primary)
                                ProductTypeBadge(type: related.type)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                        }
                        .padding(Spacing.md)
                        .antigravityGlass(cornerRadius: CornerRadius.md)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Pricing Overlay

    private var pricingOverlay: some View {
        VStack {
            Spacer()

            VStack(spacing: 0) {
                Capsule()
                    .fill(Color.secondary.opacity(0.45))
                    .frame(width: 36, height: 5)
                    .padding(.top, 10)
                    .padding(.bottom, 12)

                HStack {
                    Text("Product Pricing")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.primary)
                    Spacer()
                    Button {
                        showPricingSheet = false
                    } label: {
                        Image(systemName: "xmark")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(.secondary)
                            .frame(width: 30, height: 30)
                            .background(Color.appSecondaryBackground)
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, Spacing.xl)

                pricingSheetContent
            }
            .frame(height: pricingSheetHeight, alignment: .top)
            .frame(maxWidth: .infinity)
            .background(Color.appBackground)
            .clipShape(RoundedRectangle(cornerRadius: CornerRadius.xxl, style: .continuous))
            .gesture(pricingDetentDragGesture)
            .padding(.horizontal, Spacing.md)
            .padding(.bottom, Spacing.sm)
        }
    }

    private var pricingSheetContent: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            if viewModel.isLoadingPricing {
                HStack(spacing: Spacing.sm) {
                    ProgressView().tint(Color.appPrimary)
                    Text("Fetching pricing...")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            } else if let entry = viewModel.pricingEntry {
                VStack(alignment: .leading, spacing: Spacing.sm) {
                    Text(entry.productName)
                        .font(.headline)
                        .foregroundStyle(.primary)
                    priceRow("Retail", value: entry.pricing.retailPrice, currency: entry.pricing.currency)
                    priceRow("Wholesale", value: entry.pricing.wholesalePrice, currency: entry.pricing.currency)
                    if let availability = entry.pricing.availability {
                        Text("Availability: \(availability)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    if let updated = entry.pricing.lastUpdated {
                        Text("Updated: \(prettyDate(updated) ?? updated)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            } else {
                Text(viewModel.pricingError ?? "Pricing is not available for this product.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)
        }
        .padding(Spacing.xl)
    }

    private var pricingSheetHeight: CGFloat {
        let screenHeight = UIScreen.main.bounds.height
        return max(320, screenHeight * pricingDetent.rawValue)
    }

    private var pricingDetentDragGesture: some Gesture {
        DragGesture(minimumDistance: 12, coordinateSpace: .local)
            .onEnded { value in
                let verticalDelta = value.translation.height
                if verticalDelta < -30 {
                    pricingDetent = nextLargerPricingDetent(from: pricingDetent)
                } else if verticalDelta > 30 {
                    pricingDetent = nextSmallerPricingDetent(from: pricingDetent)
                }
            }
    }

    private func nextLargerPricingDetent(from current: PricingSheetDetent) -> PricingSheetDetent {
        switch current {
        case .compact:  return .medium
        case .medium:   return .expanded
        case .expanded: return .expanded
        }
    }

    private func nextSmallerPricingDetent(from current: PricingSheetDetent) -> PricingSheetDetent {
        switch current {
        case .compact:  return .compact
        case .medium:   return .compact
        case .expanded: return .medium
        }
    }

    private func priceRow(_ label: String, value: Double?, currency: String) -> some View {
        HStack {
            Text(label)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
            Spacer()
            Text(value.map { "\(currencySymbol(currency))\(String(format: "%.2f", $0))" } ?? "N/A")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
        }
    }

    private func currencySymbol(_ code: String) -> String {
        code.uppercased() == "USD" ? "$" : "\(code.uppercased()) "
    }

    private func prettyDate(_ value: String) -> String? {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = iso.date(from: value) ?? ISO8601DateFormatter().date(from: value)
        guard let parsed = date else { return nil }
        return parsed.formatted(date: .abbreviated, time: .omitted)
    }
}
