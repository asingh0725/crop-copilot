//
//  ProductsListView.swift
//  CropCopilot
//

import SwiftUI

struct ProductsListView: View {
    @StateObject private var viewModel = ProductsViewModel()

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                searchBar
                typeFilterBar

                if viewModel.isLoading && viewModel.products.isEmpty {
                    loadingView
                } else if viewModel.products.isEmpty {
                    emptyView
                } else {
                    productList
                }
            }
            .navigationTitle("Products")
            .task {
                await viewModel.loadProducts()
            }
            .onChange(of: viewModel.selectedType) { _ in
                Task { await viewModel.loadProducts() }
            }
        }
    }

    private var searchBar: some View {
        HStack {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField("Search products...", text: $viewModel.searchText)
                .textFieldStyle(.plain)
                .foregroundStyle(.primary)
                .onSubmit {
                    Task { await viewModel.loadProducts() }
                }
            if !viewModel.searchText.isEmpty {
                Button {
                    viewModel.searchText = ""
                    Task { await viewModel.loadProducts() }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .antigravityGlass(cornerRadius: 14)
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    private var typeFilterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(ProductsViewModel.ProductTypeFilter.allCases) { filter in
                    Button {
                        viewModel.selectedType = filter
                    } label: {
                        Text(filter.displayName)
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(
                                Capsule()
                                    .fill(
                                        viewModel.selectedType == filter
                                            ? Color.appPrimary.opacity(0.24)
                                            : Color.appSecondaryBackground
                                    )
                            )
                            .overlay(
                                Capsule()
                                    .stroke(
                                        viewModel.selectedType == filter
                                            ? Color.appPrimary
                                            : Color.black.opacity(0.10),
                                        lineWidth: viewModel.selectedType == filter ? 1.1 : 0.8
                                    )
                            )
                            .foregroundStyle(.primary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 2)
        }
    }

    private var productList: some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                HStack {
                    Text("\(viewModel.products.count) products")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Spacer()
                }
                .padding(.bottom, 2)

                ForEach(viewModel.products) { product in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(alignment: .top, spacing: 8) {
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
                            }
                            Spacer(minLength: 6)
                            Text(prettyProductType(product.type))
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(Color.appSecondary)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 5)
                                .background(Color.appPrimary.opacity(0.18))
                                .clipShape(Capsule())
                        }

                        if let description = product.description, !description.isEmpty {
                            Text(description)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .lineLimit(2)
                        }

                        HStack(spacing: 8) {
                            if let rate = product.applicationRate, !rate.isEmpty {
                                Label(rate, systemImage: "speedometer")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            if let crops = product.crops, !crops.isEmpty {
                                Text(crops.prefix(2).map(AppConstants.cropLabel).joined(separator: " • "))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
                    .antigravityGlass(cornerRadius: 16)
                }

                if let error = viewModel.errorMessage {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .refreshable {
            await viewModel.loadProducts()
        }
    }

    private var loadingView: some View {
        VStack(spacing: 12) {
            Spacer()
            ProgressView("Loading products...")
                .tint(Color.appPrimary)
            Spacer()
        }
    }

    private var emptyView: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "shippingbox")
                .font(.system(size: 44))
                .foregroundStyle(.secondary)
            Text("No products found")
                .font(.headline)
            Text("Try a different search term.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
        }
    }

    private func prettyProductType(_ raw: String) -> String {
        raw
            .replacingOccurrences(of: "_", with: " ")
            .capitalized
    }
}
