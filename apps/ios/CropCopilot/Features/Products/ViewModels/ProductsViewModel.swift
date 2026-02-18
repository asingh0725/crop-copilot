//
//  ProductsViewModel.swift
//  CropCopilot
//

import Foundation

@MainActor
final class ProductsViewModel: ObservableObject {
    enum ProductTypeFilter: String, CaseIterable, Identifiable {
        case all
        case fertilizer
        case herbicide
        case fungicide
        case insecticide
        case micronutrient
        case soilAmendment

        var id: String { rawValue }

        var displayName: String {
            switch self {
            case .all:
                return "All"
            case .micronutrient:
                return "Micronutrient"
            case .soilAmendment:
                return "Soil Amend."
            default:
                return rawValue.capitalized
            }
        }

        var apiValue: String? {
            self == .all ? nil : rawValue
        }
    }

    @Published var products: [ProductListItem] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var searchText = ""
    @Published var selectedType: ProductTypeFilter = .all

    private let apiClient = APIClient.shared

    func loadProducts() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let response: ProductsListResponse = try await apiClient.request(
                .listProducts(
                    search: searchText.isEmpty ? nil : searchText,
                    type: selectedType.apiValue
                )
            )
            products = response.products
        } catch let error as NetworkError {
            if case .cancelled = error {
                return
            }
            errorMessage = error.localizedDescription
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
