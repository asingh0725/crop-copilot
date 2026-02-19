//
//  ProductDetailViewModel.swift
//  CropCopilot
//

import Foundation

@MainActor
final class ProductDetailViewModel: ObservableObject {
    @Published var product: ProductDetailResponse?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var isLoadingPricing = false
    @Published var pricingEntry: ProductPricingEntry?
    @Published var pricingError: String?

    private let productId: String
    private let apiClient = APIClient.shared

    init(productId: String) {
        self.productId = productId
    }

    func loadProduct() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let response: ProductDetailResponse = try await apiClient.request(
                .getProduct(id: productId)
            )
            product = response
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

    func loadPricingOnDemand() async {
        guard pricingEntry == nil else {
            return
        }

        isLoadingPricing = true
        pricingError = nil
        defer { isLoadingPricing = false }

        struct BatchPricingRequest: Encodable {
            let productIds: [String]
        }

        do {
            let response: BatchPricingResponse = try await apiClient.request(
                .getProductPricing,
                body: BatchPricingRequest(productIds: [productId])
            )
            pricingEntry = response.pricing.first
            if pricingEntry == nil {
                pricingError = "No pricing data returned for this product."
            }
        } catch let error as NetworkError {
            if case .cancelled = error {
                return
            }
            pricingError = error.localizedDescription
        } catch is CancellationError {
            return
        } catch {
            pricingError = error.localizedDescription
        }
    }
}
