//
//  ProductsViewModel.swift
//  CropCopilot
//

import Foundation

@MainActor
final class ProductsViewModel: ObservableObject {
    enum ProductTypeFilter: String, CaseIterable, Identifiable {
        case all
        case fertilizer = "FERTILIZER"
        case amendment = "AMENDMENT"
        case pesticide = "PESTICIDE"
        case herbicide = "HERBICIDE"
        case fungicide = "FUNGICIDE"
        case insecticide = "INSECTICIDE"
        case seedTreatment = "SEED_TREATMENT"
        case biological = "BIOLOGICAL"
        case other = "OTHER"

        var id: String { rawValue }

        var displayName: String {
            switch self {
            case .all:
                return "All"
            case .seedTreatment:
                return "Seed Treatment"
            default:
                return rawValue
                    .lowercased()
                    .replacingOccurrences(of: "_", with: " ")
                    .split(separator: " ")
                    .map { $0.capitalized }
                    .joined(separator: " ")
            }
        }

        var apiValue: String? {
            self == .all ? nil : rawValue
        }

        /// All selectable types in the multiselect menu (excludes .all sentinel)
        static var selectableTypes: [ProductTypeFilter] {
            allCases.filter { $0 != .all }
        }
    }

    @Published var products: [ProductListItem] = []
    @Published var isLoading = false
    @Published var isLoadingMore = false
    @Published var errorMessage: String?
    @Published var searchText = ""
    /// Multiselect active type filters. Empty = show all types.
    @Published var selectedTypes: Set<ProductTypeFilter> = []
    @Published var hasMorePages = false

    /// Label shown in the filter capsule button
    var filterLabel: String {
        switch selectedTypes.count {
        case 0:  return "All Types"
        case 1:  return selectedTypes.first!.displayName
        default: return "\(selectedTypes.count) Types"
        }
    }

    @Published var totalCount: Int = 0

    private let apiClient = APIClient.shared
    private var hasLoadedOnce = false
    private let pageSize = 30
    private var offset = 0
    private var requestGeneration = 0
    /// Unfiltered products loaded from the API — client-side filter is applied on top
    private var allLoadedProducts: [ProductListItem] = []

    func loadIfNeeded() async {
        if hasLoadedOnce { return }
        hasLoadedOnce = true
        await loadProducts(reset: true)
    }

    func loadProducts(reset: Bool = true) async {
        requestGeneration += 1
        let generation = requestGeneration

        if reset {
            offset = 0
            totalCount = 0
            hasMorePages = false
        }

        isLoading = reset
        errorMessage = nil
        defer {
            if generation == requestGeneration {
                isLoading = false
            }
        }

        do {
            let response: ProductsListResponse = try await apiClient.request(
                .listProducts(
                    search: searchText.isEmpty ? nil : searchText,
                    type: nil,          // always load all types; filter applied client-side
                    limit: pageSize,
                    offset: offset,
                    sortBy: "name",
                    sortOrder: "asc"
                )
            )

            guard generation == requestGeneration else { return }

            if reset {
                allLoadedProducts = response.products
            } else {
                let existing = Set(allLoadedProducts.map(\.id))
                let nextPage = response.products.filter { !existing.contains($0.id) }
                allLoadedProducts.append(contentsOf: nextPage)
            }

            totalCount = max(response.total, allLoadedProducts.count)
            offset = allLoadedProducts.count
            hasMorePages = allLoadedProducts.count < totalCount
            hasLoadedOnce = true

            applyTypeFilter()
        } catch let error as NetworkError {
            guard generation == requestGeneration else { return }
            if case .cancelled = error { return }
            errorMessage = error.localizedDescription
        } catch is CancellationError {
            return
        } catch {
            guard generation == requestGeneration else { return }
            errorMessage = error.localizedDescription
        }
    }

    func refreshProducts() async {
        hasLoadedOnce = true
        await loadProducts(reset: true)
    }

    func loadNextPage() async {
        guard hasMorePages, !isLoadingMore, !isLoading else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        await loadProducts(reset: false)
    }

    /// Toggle a type in/out of the active filter set and immediately apply.
    func toggleType(_ filter: ProductTypeFilter) {
        if selectedTypes.contains(filter) {
            selectedTypes.remove(filter)
        } else {
            selectedTypes.insert(filter)
        }
        applyTypeFilter()
    }

    /// Clear all active type filters (show everything).
    func clearTypes() {
        selectedTypes = []
        applyTypeFilter()
    }

    // MARK: - Private

    private func applyTypeFilter() {
        if selectedTypes.isEmpty {
            products = allLoadedProducts
        } else {
            let typeValues = Set(selectedTypes.map { $0.rawValue.uppercased() })
            products = allLoadedProducts.filter { typeValues.contains($0.type.uppercased()) }
        }
    }
}
