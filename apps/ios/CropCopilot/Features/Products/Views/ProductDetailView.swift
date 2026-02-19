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
    @State private var pricingDetent: PricingSheetDetent = .medium

    init(productId: String) {
        self.productId = productId
        _viewModel = StateObject(wrappedValue: ProductDetailViewModel(productId: productId))
    }

    var body: some View {
        ZStack {
            Group {
                if viewModel.isLoading {
                    VStack(spacing: 14) {
                        ProgressView()
                            .tint(Color.appPrimary)
                        Text("Loading product...")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                } else if let product = viewModel.product {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 14) {
                            headerCard(product)
                            pricingRow
                            recommendationLinks(product)
                            relatedProducts(product)
                        }
                        .padding(16)
                        .padding(.bottom, 20)
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
        .animation(.easeInOut(duration: 0.18), value: showPricingSheet)
    }

    private func headerCard(_ product: ProductDetailResponse) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(product.name)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.primary)

                    if let brand = product.brand, !brand.isEmpty {
                        Text(brand)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 8)
                Text(prettyType(product.type))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.appSecondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Color.appPrimary.opacity(0.18))
                    .clipShape(Capsule())
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
        .padding(16)
        .antigravityGlass(cornerRadius: 16)
    }

    private var pricingRow: some View {
        Button {
            showPricingSheet = true
            Task {
                await viewModel.loadPricingOnDemand()
            }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "dollarsign.circle")
                    .font(.headline)
                    .foregroundStyle(Color.appPrimary)
                    .frame(width: 32, height: 32)
                    .background(Color.appPrimary.opacity(0.14))
                    .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))

                VStack(alignment: .leading, spacing: 2) {
                    Text("On-demand pricing")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                    Text("Tap to fetch latest pricing for this product")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .antigravityGlass(cornerRadius: 16)
        }
        .buttonStyle(.plain)
    }

    private func recommendationLinks(_ product: ProductDetailResponse) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Used In Recommendations")
                    .font(.headline)
                    .foregroundStyle(.primary)
                Spacer()
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
                        HStack(spacing: 10) {
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
                        .padding(12)
                        .antigravityGlass(cornerRadius: 12)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func relatedProducts(_ product: ProductDetailResponse) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Related Products")
                .font(.headline)
                .foregroundStyle(.primary)

            if product.relatedProducts.isEmpty {
                Text("No related products available.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(product.relatedProducts.prefix(4)) { related in
                    NavigationLink {
                        ProductDetailView(productId: related.id)
                    } label: {
                        HStack(spacing: 10) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(related.name)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(.primary)
                                Text(prettyType(related.type))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                        }
                        .padding(12)
                        .antigravityGlass(cornerRadius: 12)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var pricingSheet: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Latest Pricing")
                .font(.title3.weight(.semibold))
                .foregroundStyle(.primary)

            if viewModel.isLoadingPricing {
                HStack(spacing: 10) {
                    ProgressView().tint(Color.appPrimary)
                    Text("Fetching pricing...")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            } else if let entry = viewModel.pricingEntry {
                VStack(alignment: .leading, spacing: 8) {
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
        .padding(20)
    }

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
                .padding(.horizontal, 20)

                pricingSheet
            }
            .frame(height: pricingSheetHeight, alignment: .top)
            .frame(maxWidth: .infinity)
            .background(Color.appBackground)
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            .gesture(pricingDetentDragGesture)
            .padding(.horizontal, 12)
            .padding(.bottom, 10)
        }
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
        case .compact:
            return .medium
        case .medium:
            return .expanded
        case .expanded:
            return .expanded
        }
    }

    private func nextSmallerPricingDetent(from current: PricingSheetDetent) -> PricingSheetDetent {
        switch current {
        case .compact:
            return .compact
        case .medium:
            return .compact
        case .expanded:
            return .medium
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
        if code.uppercased() == "USD" {
            return "$"
        }
        return "\(code.uppercased()) "
    }

    private func prettyType(_ raw: String) -> String {
        raw.replacingOccurrences(of: "_", with: " ").capitalized
    }

    private func prettyDate(_ value: String) -> String? {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = iso.date(from: value) ?? ISO8601DateFormatter().date(from: value)
        guard let parsed = date else {
            return nil
        }
        return parsed.formatted(date: .abbreviated, time: .omitted)
    }
}
