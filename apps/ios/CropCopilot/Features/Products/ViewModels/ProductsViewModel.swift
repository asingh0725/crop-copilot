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
    }

    @Published var products: [ProductListItem] = []
    @Published var isLoading = false
    @Published var isLoadingMore = false
    @Published var errorMessage: String?
    @Published var searchText = ""
    @Published var selectedType: ProductTypeFilter = .all
    @Published var hasMorePages = false

    private let apiClient = APIClient.shared
    private var hasLoadedOnce = false
    private let pageSize = 100
    private var offset = 0
    private var total = 0
    private var requestGeneration = 0

    func loadIfNeeded() async {
        if hasLoadedOnce {
            return
        }
        hasLoadedOnce = true
        await loadProducts(reset: true)
    }

    func loadProducts(reset: Bool = true) async {
        requestGeneration += 1
        let generation = requestGeneration

        if reset {
            offset = 0
            total = 0
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
                    type: selectedType.apiValue,
                    limit: pageSize,
                    offset: offset,
                    sortBy: "name",
                    sortOrder: "asc"
                )
            )

            guard generation == requestGeneration else {
                return
            }

            if reset {
                products = response.products
            } else {
                let existing = Set(products.map(\.id))
                let nextPage = response.products.filter { !existing.contains($0.id) }
                products.append(contentsOf: nextPage)
            }

            total = max(response.total, products.count)
            offset = products.count
            hasMorePages = products.count < total
            hasLoadedOnce = true
        } catch let error as NetworkError {
            guard generation == requestGeneration else {
                return
            }
            if case .cancelled = error {
                return
            }
            errorMessage = error.localizedDescription
        } catch is CancellationError {
            return
        } catch {
            guard generation == requestGeneration else {
                return
            }
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
}
