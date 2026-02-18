//
//  ProductsViewModel.swift
//  CropCopilot
//

import Foundation

@MainActor
final class ProductsViewModel: ObservableObject {
    @Published var products: [ProductListItem] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var searchText = ""

    private let apiClient = APIClient.shared

    func loadProducts() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let response: ProductsListResponse = try await apiClient.request(
                .listProducts(search: searchText.isEmpty ? nil : searchText, type: nil)
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
