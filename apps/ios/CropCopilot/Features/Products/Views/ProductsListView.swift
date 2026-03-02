//
//  ProductsListView.swift
//  CropCopilot
//

import SwiftUI

struct ProductsListView: View {
    @StateObject private var viewModel = ProductsViewModel()

    var body: some View {
        NavigationStack {
            VStack(spacing: Spacing.md) {
                searchBar
                filterControlBar

                if viewModel.isLoading && viewModel.products.isEmpty {
                    loadingView
                } else if viewModel.products.isEmpty {
                    emptyView
                } else {
                    productList
                }
            }
            .navigationTitle("Products")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    CreditsBalanceChip()
                }
            }
            .navigationDestination(for: String.self) { productId in
                ProductDetailView(productId: productId)
            }
            .task {
                await viewModel.loadIfNeeded()
            }
            .onAppear {
                Task {
                    await viewModel.refreshProducts()
                }
            }
        }
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField("Search products...", text: $viewModel.searchText)
                .textFieldStyle(.plain)
                .foregroundStyle(.primary)
                .onSubmit {
                    Task { await viewModel.loadProducts(reset: true) }
                }
            if !viewModel.searchText.isEmpty {
                Button {
                    viewModel.searchText = ""
                    Task { await viewModel.loadProducts(reset: true) }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.horizontal, Spacing.md)
        .padding(.vertical, Spacing.sm + 2)
        .antigravityGlass(cornerRadius: CornerRadius.md)
        .padding(.horizontal, Spacing.lg)
        .padding(.top, Spacing.sm)
    }

    // MARK: - Filter Control Bar (multiselect, matches Recommendations sort style)

    private var filterControlBar: some View {
        HStack(spacing: Spacing.sm) {
            // Multiselect type filter — styled capsule opening a Menu with checkmarks
            Menu {
                ForEach(ProductsViewModel.ProductTypeFilter.selectableTypes) { filter in
                    Button {
                        viewModel.toggleType(filter)
                    } label: {
                        if viewModel.selectedTypes.contains(filter) {
                            Label(filter.displayName, systemImage: "checkmark")
                        } else {
                            Text(filter.displayName)
                        }
                    }
                }

                if !viewModel.selectedTypes.isEmpty {
                    Divider()
                    Button("Show All Types", role: .destructive) {
                        viewModel.clearTypes()
                    }
                }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "line.3.horizontal.decrease")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Color.appPrimary)
                    Text(viewModel.filterLabel)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                }
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, Spacing.md)
                .padding(.vertical, Spacing.sm + 2)
                .background(
                    viewModel.selectedTypes.isEmpty
                        ? Color.appPrimary.opacity(0.10)
                        : Color.appPrimary.opacity(0.20)
                )
                .clipShape(Capsule())
                .overlay(
                    Capsule().stroke(
                        Color.appPrimary.opacity(viewModel.selectedTypes.isEmpty ? 0.22 : 0.50),
                        lineWidth: 1
                    )
                )
            }

            Spacer()

            if !viewModel.selectedTypes.isEmpty {
                // Active filter badge showing count, tap to clear
                Button {
                    viewModel.clearTypes()
                } label: {
                    HStack(spacing: 4) {
                        Text("\(viewModel.selectedTypes.count) active")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.appPrimary)
                        Image(systemName: "xmark")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(Color.appPrimary)
                    }
                    .padding(.horizontal, Spacing.sm + 2)
                    .padding(.vertical, Spacing.xs + 2)
                    .background(Color.appPrimary.opacity(0.10))
                    .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .transition(.scale.combined(with: .opacity))
            }
        }
        .animation(.appFast, value: viewModel.selectedTypes.isEmpty)
        .padding(.horizontal, Spacing.lg)
    }

    // MARK: - Product List

    private var productList: some View {
        ScrollView {
            LazyVStack(spacing: Spacing.sm) {
                HStack {
                    // When a type filter is active, products is already client-side filtered —
                    // show that filtered count instead of the unfiltered server total.
                    let count = viewModel.selectedTypes.isEmpty
                        ? (viewModel.totalCount > 0 ? viewModel.totalCount : viewModel.products.count)
                        : viewModel.products.count
                    Text("\(count) product\(count == 1 ? "" : "s")")
                        .font(.appCaption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Spacer()
                }
                .padding(.bottom, 2)

                ForEach(Array(viewModel.products.enumerated()), id: \.element.id) { index, product in
                    NavigationLink(value: product.id) {
                        productRow(product)
                    }
                    .buttonStyle(.plain)
                    .onAppear {
                        let preloadThreshold = max(viewModel.products.count - 6, 0)
                        if index >= preloadThreshold {
                            Task { await viewModel.loadNextPage() }
                        }
                    }
                }

                if viewModel.hasMorePages {
                    loadMoreButton
                }

                if let error = viewModel.errorMessage {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.bottom, Spacing.xxl)
        }
        .refreshable {
            await viewModel.refreshProducts()
        }
    }

    private func productRow(_ product: ProductListItem) -> some View {
        HStack(alignment: .top, spacing: Spacing.md) {
            // Type icon badge
            IconBadge(
                icon: iconForType(product.type),
                color: .forProductType(product.type),
                size: 38,
                cornerRadius: 11
            )

            VStack(alignment: .leading, spacing: 4) {
                Text(product.name)
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .lineLimit(2)

                if let brand = product.brand, !brand.isEmpty {
                    Text(brand)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                if let description = product.description, !description.isEmpty {
                    Text(description)
                        .font(.appBodySmall)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                HStack(spacing: Spacing.sm) {
                    ProductTypeBadge(type: product.type)

                    if let rate = product.applicationRate, !rate.isEmpty {
                        Label(rate, systemImage: "speedometer")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.top, 2)
            }

            Spacer(minLength: 4)

            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
                .padding(.top, 2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.md)
        .antigravityGlass(cornerRadius: CornerRadius.lg)
        .coloredShadow(.forProductType(product.type), radius: 6, opacity: 0.07)
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

    // MARK: - Load More

    private var loadMoreButton: some View {
        Button {
            Task { await viewModel.loadNextPage() }
        } label: {
            HStack(spacing: Spacing.sm) {
                if viewModel.isLoadingMore {
                    ProgressView().tint(Color.appPrimary)
                } else {
                    Image(systemName: "arrow.right.circle.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(Color.appPrimary)
                    Text("Load More")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.vertical, Spacing.md)
            .antigravityGlass(cornerRadius: CornerRadius.md)
        }
        .buttonStyle(.plain)
    }

    // MARK: - States

    private var loadingView: some View {
        ScrollView {
            LazyVStack(spacing: Spacing.sm) {
                ForEach(0..<6, id: \.self) { _ in
                    HStack(alignment: .top, spacing: Spacing.md) {
                        SkeletonCard(height: 38, cornerRadius: 11)
                            .frame(width: 38)
                        VStack(alignment: .leading, spacing: Spacing.sm) {
                            SkeletonLine(height: 16)
                            SkeletonLine(width: 120, height: 12)
                            SkeletonLine(height: 12)
                            SkeletonLine(width: 80, height: 22, cornerRadius: 11)
                        }
                        Spacer()
                    }
                    .padding(Spacing.md)
                    .antigravityGlass(cornerRadius: CornerRadius.lg)
                }
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.vertical, Spacing.sm)
        }
    }

    private var emptyView: some View {
        VStack(spacing: Spacing.md) {
            Spacer()
            IconBadge(icon: "shippingbox.fill", color: .appSecondary, size: 52, cornerRadius: 16)
            Text("No products found")
                .font(.headline)
            Text("Try a different search term or filter.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
        }
    }
}
